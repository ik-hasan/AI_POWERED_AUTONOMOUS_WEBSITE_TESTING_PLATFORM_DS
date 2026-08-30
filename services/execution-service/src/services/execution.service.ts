import axios from 'axios';
import { io as ioClient, Socket } from 'socket.io-client';
import { Logger, ExecutionJob, formatStepActivity, ExecutionAbortedError } from '@platform/shared';
import { IExecutionDocument } from '../models/execution.model';
import { ExecutionModel } from '../models/execution.model';
import { RabbitMQService } from './rabbitmq.service';
import { PlaywrightExecutor } from './playwright.service';

export class ExecutionService {
  private logger = new Logger('execution-service');
  private socket: Socket | null = null;
  private activeJobs = new Map<string, boolean>();
  private abortedExecutions = new Set<string>();

  constructor(
    private readonly rabbitmq: RabbitMQService | null,
    private readonly executor: PlaywrightExecutor,
    private readonly reportServiceUrl: string,
    private readonly notificationServiceUrl: string,
    private readonly aiServiceUrl: string,
    private readonly devInlineMode = false
  ) {}

  connectNotifications(): void {
    this.socket = ioClient(this.notificationServiceUrl, { transports: ['websocket', 'polling'] });
    this.socket.on('connect', () => this.logger.info('Connected to notification service'));
  }

  getNotificationSocket(): Socket | null {
    return this.socket;
  }

  async startConsumer(): Promise<void> {
    if (this.devInlineMode || !this.rabbitmq) {
      this.logger.info('Running in inline execution mode (no RabbitMQ)');
      return;
    }
    await this.rabbitmq.consume(async (job) => {
      await this.processJob(job);
    });
  }

  async queueExecution(
    testCaseId: string,
    userId: string,
    parallelWorkers = 1,
    maxRetries = 2,
    headless = true
  ): Promise<IExecutionDocument> {
    const testCaseRes = await axios.get(`${this.aiServiceUrl}/api/test-cases/${testCaseId}`);
    const testCase = testCaseRes.data.data;

    const websiteRes = await axios.get(`${this.reportServiceUrl}/api/websites/${testCase.websiteId}`);
    const website = websiteRes.data.data;

    const execution = await ExecutionModel.create({
      testCaseId,
      projectId: testCase.projectId,
      websiteId: testCase.websiteId,
      status: 'queued',
      parallelWorkers,
      maxRetries,
      triggeredBy: userId,
      totalSteps: testCase.steps.length,
    });

    const job: ExecutionJob = {
      executionId: execution._id.toString(),
      testCaseId,
      websiteUrl: website.url,
      steps: testCase.steps,
      parallelWorkers,
      retryCount: 0,
      maxRetries,
      triggeredBy: userId,
      headless,
    };

    if (this.devInlineMode || !this.rabbitmq) {
      setImmediate(() => { this.processJob(job).catch((err) => this.logger.error('Inline job failed', { error: err.message })); });
    } else {
      await this.rabbitmq.publishJob(job);
    }
    return execution;
  }

  private async processJob(job: ExecutionJob): Promise<void> {
    if (this.activeJobs.get(job.executionId)) return;

    if (this.abortedExecutions.has(job.executionId)) {
      await this.cleanupAbortedExecution(job.executionId);
      return;
    }

    this.activeJobs.set(job.executionId, true);

    try {
      await ExecutionModel.findByIdAndUpdate(job.executionId, {
        status: 'running',
        startedAt: new Date(),
      });

      if (this.abortedExecutions.has(job.executionId)) {
        await this.cleanupAbortedExecution(job.executionId);
        return;
      }

      this.emitProgress(job.executionId, 'running', 0, 0, job.steps.length, undefined, {
        stepActivity: 'Launching browser and preparing test environment...',
        phase: 'start',
      });

      const result = await this.executor.execute(
        job.steps,
        job.websiteUrl,
        (update) => {
          if (this.abortedExecutions.has(job.executionId)) return;
          const { progress, currentStep, totalSteps, step, phase, durationMs } = update;
          ExecutionModel.findByIdAndUpdate(job.executionId, { progress, currentStep }).exec();
          this.emitProgress(job.executionId, 'running', progress, currentStep, totalSteps, undefined, {
            stepAction: step.action,
            stepActivity: formatStepActivity(step, job.websiteUrl, phase),
            phase,
            durationMs,
          });
        },
        { headless: job.headless ?? true, executionId: job.executionId }
      );

      if (this.abortedExecutions.has(job.executionId)) {
        await this.cleanupAbortedExecution(job.executionId);
        return;
      }

      const finalStatus = result.status === 'passed' ? 'passed' : 'failed';

      if (result.status === 'failed' && job.retryCount < job.maxRetries) {
        if (this.abortedExecutions.has(job.executionId)) {
          await this.cleanupAbortedExecution(job.executionId);
          return;
        }
        await ExecutionModel.findByIdAndUpdate(job.executionId, {
          status: 'retrying',
          retryCount: job.retryCount + 1,
        });
        if (this.rabbitmq && !this.devInlineMode) {
          await this.rabbitmq.publishJob({ ...job, retryCount: job.retryCount + 1 });
        } else {
          setImmediate(() => { this.processJob({ ...job, retryCount: job.retryCount + 1 }).catch(() => {}); });
        }
        return;
      }

      // Update UI immediately — don't wait for report creation
      await ExecutionModel.findByIdAndUpdate(job.executionId, {
        status: finalStatus,
        completedAt: new Date(),
        duration: result.duration,
        progress: 100,
        currentStep: job.steps.length,
      });

      this.emitProgress(job.executionId, finalStatus, 100, job.steps.length, job.steps.length, result.errorMessage, {
        stepActivity: finalStatus === 'passed' ? 'All steps completed successfully' : 'Test execution finished with errors',
        phase: 'complete',
      });

      try {
        const testCaseRes = await axios.get(`${this.aiServiceUrl}/api/test-cases/${job.testCaseId}`);
        const testCase = testCaseRes.data.data;

        await axios.post(`${this.reportServiceUrl}/api/reports`, {
          executionId: job.executionId,
          testCaseId: job.testCaseId,
          projectId: testCase.projectId,
          title: testCase.title,
          status: finalStatus,
          stepLogs: result.stepLogs,
          errorMessage: result.errorMessage,
          screenshots: result.screenshots,
          metrics: {
            totalSteps: result.stepLogs.length,
            passedSteps: result.stepLogs.filter((s) => s.status === 'passed').length,
            failedSteps: result.stepLogs.filter((s) => s.status === 'failed').length,
            duration: result.duration,
          },
        });
      } catch (reportErr) {
        this.logger.error('Report creation failed', { executionId: job.executionId, error: (reportErr as Error).message });
      }
    } catch (err) {
      if (err instanceof ExecutionAbortedError || this.abortedExecutions.has(job.executionId)) {
        await this.cleanupAbortedExecution(job.executionId);
        return;
      }
      this.logger.error('Execution failed', { executionId: job.executionId, error: (err as Error).message });
      await ExecutionModel.findByIdAndUpdate(job.executionId, { status: 'failed', completedAt: new Date() });
      this.emitProgress(job.executionId, 'failed', 0, 0, job.steps.length, (err as Error).message);
    } finally {
      this.activeJobs.delete(job.executionId);
    }
  }

  async abortExecution(executionId: string): Promise<void> {
    const execution = await ExecutionModel.findById(executionId);
    if (!execution) throw new Error('Execution not found');

    if (!['queued', 'running', 'retrying'].includes(execution.status)) {
      throw new Error('Only queued or running executions can be aborted');
    }

    this.abortedExecutions.add(executionId);
    this.executor.abort(executionId);

    if (execution.status === 'queued' && !this.activeJobs.get(executionId)) {
      await this.cleanupAbortedExecution(executionId);
    }
  }

  private async cleanupAbortedExecution(executionId: string): Promise<void> {
    try {
      await axios.delete(`${this.reportServiceUrl}/api/reports/execution/${executionId}`);
    } catch {
      // No report yet — expected for aborted runs
    }

    await ExecutionModel.findByIdAndDelete(executionId);

    this.emitProgress(executionId, 'cancelled', 0, 0, 0, undefined, {
      stepActivity: 'Execution aborted — removed from history',
      phase: 'complete',
    });

    this.abortedExecutions.delete(executionId);
    this.activeJobs.delete(executionId);
    this.logger.info('Execution aborted and removed', { executionId });
  }

  private emitProgress(
    executionId: string,
    status: string,
    progress: number,
    currentStep: number,
    totalSteps: number,
    error?: string,
    stepInfo?: {
      stepAction?: string;
      stepActivity?: string;
      phase?: 'start' | 'done' | 'complete';
      durationMs?: number;
    }
  ): void {
    this.socket?.emit('execution:progress', {
      executionId,
      status,
      progress,
      currentStep,
      totalSteps,
      error,
      stepAction: stepInfo?.stepAction,
      stepActivity: stepInfo?.stepActivity,
      phase: stepInfo?.phase,
      durationMs: stepInfo?.durationMs,
      timestamp: new Date().toISOString(),
    });
  }

  async getExecution(id: string) {
    const execution = await ExecutionModel.findById(id);
    if (!execution) throw new Error('Execution not found');
    return execution;
  }

  async listExecutions(projectId: string, page: number, limit: number) {
    const filter = projectId ? { projectId } : {};
    const [data, total] = await Promise.all([
      ExecutionModel.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      ExecutionModel.countDocuments(filter),
    ]);
    return { data, total, page, limit, totalPages: Math.ceil(total / limit) };
  }

  async retryExecution(executionId: string, userId: string) {
    const execution = await ExecutionModel.findById(executionId);
    if (!execution) throw new Error('Execution not found');
    return this.queueExecution(execution.testCaseId, userId, execution.parallelWorkers, execution.maxRetries);
  }
}
