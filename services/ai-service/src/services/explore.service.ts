import {
  Logger,
  ExploreJob,
  ExploreHopLog,
  ExploreProgress,
  ExploreCompleteInput,
  ExploreNextBatchInput,
  normalizeTestSteps,
} from '@platform/shared';
import { ExploreSessionModel, IExploreSessionDocument } from '../models/exploreSession.model';
import { GeminiNotConfiguredError, GeminiService } from './gemini.service';
import { TestCaseService } from './testCase.service';
import { validateTestSteps } from '../repositories/testCase.repository';

export class ExploreService {
  private logger = new Logger('explore-service');

  constructor(
    private readonly gemini: GeminiService,
    private readonly testCaseService: TestCaseService,
    private readonly executionServiceUrl: string
  ) {}

  async start(input: {
    projectId: string;
    websiteId: string;
    websiteUrl: string;
    prompt: string;
    title?: string;
    userId: string;
    headless: boolean;
  }): Promise<IExploreSessionDocument> {
    if (!this.gemini.isConfigured()) {
      throw new GeminiNotConfiguredError();
    }

    const session = await ExploreSessionModel.create({
      projectId: input.projectId,
      websiteId: input.websiteId,
      websiteUrl: input.websiteUrl,
      prompt: input.prompt,
      title: input.title,
      createdBy: input.userId,
      status: 'queued',
    });

    const job: ExploreJob = {
      exploreId: session._id.toString(),
      projectId: input.projectId,
      websiteId: input.websiteId,
      websiteUrl: input.websiteUrl,
      prompt: input.prompt,
      title: input.title,
      userId: input.userId,
      headless: input.headless,
    };

    try {
      await postWithRetry(`${this.executionServiceUrl}/api/executions/explore`, job);
    } catch (err) {
      session.status = 'failed';
      session.error = (err as Error).message;
      await session.save();
      throw err;
    }

    return session;
  }

  async getById(id: string): Promise<IExploreSessionDocument> {
    const session = await ExploreSessionModel.findById(id);
    if (!session) throw new Error('Explore session not found');
    return session;
  }

  async applyProgress(id: string, progress: Partial<ExploreProgress> & { hopLog?: ExploreHopLog[] }) {
    const session = await ExploreSessionModel.findById(id);
    if (!session) throw new Error('Explore session not found');
    if (session.status === 'cancelled') return session;

    if (progress.status) session.status = progress.status;
    if (typeof progress.hop === 'number') session.hops = progress.hop;
    if (typeof progress.geminiCalls === 'number') session.geminiCalls = progress.geminiCalls;
    if (progress.error) session.error = progress.error;
    if (progress.hopLog?.length) {
      session.hopLog.push(...progress.hopLog);
    } else if (progress.message) {
      session.hopLog.push({
        hop: progress.hop ?? session.hops,
        url: progress.url || session.websiteUrl,
        message: progress.message,
        screenshotUrl: progress.screenshotUrl,
        timestamp: progress.timestamp || new Date().toISOString(),
      });
    }
    await session.save();
    return session;
  }

  async nextBatch(input: ExploreNextBatchInput) {
    const session = await ExploreSessionModel.findById(input.exploreId);
    if (!session) throw new Error('Explore session not found');
    if (session.status === 'cancelled') {
      return { cancelled: true, batch: parseEmptyCancelledBatch() };
    }

    session.geminiCalls += 1;
    session.status = 'running';
    await session.save();

    const batch = await this.gemini.decideNextBatch({
      prompt: input.prompt,
      websiteUrl: input.websiteUrl,
      currentUrl: input.currentUrl,
      title: input.title || '',
      elementsText: input.elementsText,
      screenshotBase64: input.screenshotBase64,
      mimeType: input.mimeType || 'image/jpeg',
      recordedSteps: input.recordedSteps,
      hop: input.hop,
    });

    return { cancelled: false, batch };
  }

  async complete(id: string, payload: ExploreCompleteInput) {
    const session = await ExploreSessionModel.findById(id);
    if (!session) throw new Error('Explore session not found');

    session.status = payload.status;
    session.hops = payload.hops;
    session.geminiCalls = payload.geminiCalls;
    session.recordedSteps = payload.steps || [];
    if (payload.hopLog?.length) session.hopLog = payload.hopLog;
    if (payload.error) session.error = payload.error;

    const shouldSave =
      (payload.status === 'completed' || payload.status === 'cannot_proceed') &&
      (payload.steps?.length || 0) > 1;

    if (shouldSave) {
      const steps = normalizeTestSteps(payload.steps || []);
      const validation = validateTestSteps(steps);
      const testCase = await this.testCaseService.createFromExplore({
        projectId: session.projectId,
        websiteId: session.websiteId,
        title: payload.title || session.title || session.prompt.slice(0, 80),
        description: payload.description || session.prompt,
        prompt: session.prompt,
        steps,
        createdBy: session.createdBy,
        status: payload.status === 'completed' && validation.valid ? 'ready' : 'draft',
        exploreId: session._id.toString(),
        hops: payload.hops,
        geminiCalls: payload.geminiCalls,
      });
      session.testCaseId = testCase._id.toString();
    }

    await session.save();
    return session;
  }

  async abort(id: string) {
    const session = await ExploreSessionModel.findById(id);
    if (!session) throw new Error('Explore session not found');
    if (['completed', 'failed', 'cannot_proceed', 'cancelled'].includes(session.status)) {
      return session;
    }
    session.status = 'cancelled';
    session.error = 'Explore aborted by user';
    await session.save();

    try {
      await fetch(`${this.executionServiceUrl}/api/executions/explore/${id}/abort`, {
        method: 'POST',
      });
    } catch (err) {
      this.logger.warn('Failed to notify execution-service of explore abort', {
        error: (err as Error).message,
      });
    }
    return session;
  }
}

function parseEmptyCancelledBatch() {
  return {
    actions: [],
    expectsNavigation: false,
    done: false,
    cannotProceed: true,
    reason: 'Explore aborted by user',
  };
}

async function postWithRetry(url: string, body: unknown, attempts = 5): Promise<void> {
  let lastError: Error | null = null;
  for (let i = 0; i < attempts; i++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) return;
      lastError = new Error(`Execution service rejected explore job (${res.status}): ${await res.text()}`);
    } catch (err) {
      lastError = err as Error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000 * (i + 1)));
  }
  throw lastError ?? new Error('Failed to queue explore job');
}
