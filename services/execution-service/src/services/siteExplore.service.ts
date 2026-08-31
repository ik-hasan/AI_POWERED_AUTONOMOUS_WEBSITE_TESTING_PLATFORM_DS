import axios from 'axios';
import { Socket } from 'socket.io-client';
import {
  Logger,
  ExploreJob,
  ExploreBatch,
  ExploreHopLog,
  ExploreProgress,
  ExploreStatus,
  TestStep,
  ExecutionAbortedError,
  normalizeTestSteps,
} from '@platform/shared';
import { PlaywrightExecutor } from './playwright.service';
import { RabbitMQService } from './rabbitmq.service';

const MAX_HOPS = () => Math.max(1, parseInt(process.env.MAX_EXPLORE_HOPS || '15', 10));
const EXPLORE_TIMEOUT_MS = () => Math.max(30000, parseInt(process.env.EXPLORE_TIMEOUT_MS || '180000', 10));

type WalkResult = { status: ExploreStatus; error?: string; title?: string; description?: string };

export class SiteExploreService {
  private logger = new Logger('site-explore');
  private active = new Set<string>();

  constructor(
    private readonly executor: PlaywrightExecutor,
    private readonly rabbitmq: RabbitMQService | null,
    private readonly aiServiceUrl: string,
    private readonly getSocket: () => Socket | null,
    private readonly devInlineMode = false
  ) {}

  async queue(job: ExploreJob): Promise<void> {
    if (this.devInlineMode || !this.rabbitmq) {
      setImmediate(() => {
        this.run(job).catch((err) => this.logger.error('Inline explore failed', { error: err.message }));
      });
      return;
    }
    await this.rabbitmq.publishExploreJob(job);
  }

  async startConsumer(): Promise<void> {
    if (this.devInlineMode || !this.rabbitmq) return;
    await this.rabbitmq.consumeExplore(async (job) => {
      await this.run(job);
    });
  }

  abort(exploreId: string): boolean {
    return this.executor.abort(exploreId);
  }

  async run(job: ExploreJob): Promise<void> {
    if (this.active.has(job.exploreId)) return;
    this.active.add(job.exploreId);

    const maxHops = MAX_HOPS();
    const hopLog: ExploreHopLog[] = [];
    const recordedSteps: TestStep[] = [];
    let geminiCalls = 0;
    let hops = 0;
    let suggestedTitle = job.title;
    let suggestedDescription: string | undefined;
    let lastScreenshot: string | undefined;
    let lastUrl = job.websiteUrl;

    const pushLog = (message: string, url = lastUrl, screenshotUrl?: string) => {
      const entry: ExploreHopLog = {
        hop: hops,
        url,
        message,
        screenshotUrl: screenshotUrl || lastScreenshot,
        timestamp: new Date().toISOString(),
      };
      hopLog.push(entry);
      this.emit(job.exploreId, {
        status: 'running',
        hop: hops,
        maxHops,
        message,
        url,
        screenshotUrl: entry.screenshotUrl,
        stepsRecorded: recordedSteps.length,
        geminiCalls,
      });
    };

    this.executor.startTrackedRun(job.exploreId);

    let status: ExploreStatus = 'failed';
    let error: string | undefined;

    try {
      const result = await this.walkSite(job, {
        maxHops,
        deadline: Date.now() + EXPLORE_TIMEOUT_MS(),
        hopLog,
        recordedSteps,
        getHops: () => hops,
        setHops: (n) => { hops = n; },
        getGeminiCalls: () => geminiCalls,
        setGeminiCalls: (n) => { geminiCalls = n; },
        setTitle: (t) => { if (t) suggestedTitle = t; },
        setDescription: (d) => { if (d) suggestedDescription = d; },
        setLastScreenshot: (s) => { lastScreenshot = s; },
        setLastUrl: (u) => { lastUrl = u; },
        pushLog,
      });
      status = result.status;
      error = result.error;
      if (result.title) suggestedTitle = result.title;
      if (result.description) suggestedDescription = result.description;
    } catch (err) {
      const aborted = err instanceof ExecutionAbortedError || this.executor.isAborted(job.exploreId);
      status = aborted ? 'cancelled' : recordedSteps.length > 1 ? 'cannot_proceed' : 'failed';
      error = (err as Error).message;
    } finally {
      this.executor.endTrackedRun(job.exploreId);
      this.active.delete(job.exploreId);
    }

    await this.finish(job.exploreId, {
      status,
      steps: recordedSteps,
      hops,
      geminiCalls,
      hopLog,
      title: suggestedTitle,
      description: suggestedDescription,
      error,
    });
  }

  private async walkSite(
    job: ExploreJob,
    ctx: {
      maxHops: number;
      deadline: number;
      hopLog: ExploreHopLog[];
      recordedSteps: TestStep[];
      getHops: () => number;
      setHops: (n: number) => void;
      getGeminiCalls: () => number;
      setGeminiCalls: (n: number) => void;
      setTitle: (t?: string) => void;
      setDescription: (d?: string) => void;
      setLastScreenshot: (s?: string) => void;
      setLastUrl: (u: string) => void;
      pushLog: (message: string, url?: string, screenshotUrl?: string) => void;
    }
  ): Promise<WalkResult> {
    this.emit(job.exploreId, {
      status: 'running',
      hop: 0,
      maxHops: ctx.maxHops,
      message: 'Launching browser...',
      url: job.websiteUrl,
      stepsRecorded: 0,
      geminiCalls: 0,
    });
    await this.syncProgress(job.exploreId, { status: 'running', message: 'Launching browser...' });

    const browser = await this.executor.launchBrowser(job.headless ?? true);
    this.executor.attachBrowser(job.exploreId, browser);

    try {
    const { context, page: startPage } = await this.executor.newPage(browser);
    let page = startPage;

    this.throwIfAborted(job.exploreId);
    await page.goto(job.websiteUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this.executor.waitForSettle(page);
    page = this.executor.activePage(context, page);

    ctx.recordedSteps.push({
      order: 0,
      action: 'navigate',
      value: job.websiteUrl,
      description: `Navigate to ${job.websiteUrl}`,
      locatorStrategy: 'css',
    });
    ctx.setLastUrl(page.url());
    ctx.pushLog(`Opened ${page.url()}`, page.url());

    let terminal: ExploreStatus | null = null;
    let terminalReason: string | undefined;

    for (let hop = 1; hop <= ctx.maxHops; hop++) {
      this.throwIfAborted(job.exploreId);
      if (Date.now() > ctx.deadline) {
        return {
          status: ctx.recordedSteps.length > 1 ? 'cannot_proceed' : 'failed',
          error: `Explore timed out after ${EXPLORE_TIMEOUT_MS() / 1000}s`,
        };
      }
      ctx.setHops(hop);
      page = this.executor.activePage(context, page);

      const snapshot = await this.executor.capturePageSnapshot(page, hop);
      ctx.setLastScreenshot(snapshot.screenshotUrl);
      ctx.setLastUrl(snapshot.url);
      ctx.pushLog(`Snapshot of ${snapshot.url} (${snapshot.elements.length} elements)`, snapshot.url, snapshot.screenshotUrl);

      const { cancelled, batch } = await this.requestBatch(job, snapshot, ctx.recordedSteps, hop);
      ctx.setGeminiCalls(ctx.getGeminiCalls() + 1);
      ctx.setTitle(batch.title);
      ctx.setDescription(batch.description);

      if (cancelled || this.executor.isAborted(job.exploreId)) {
        throw new ExecutionAbortedError();
      }

      if (batch.cannotProceed) {
        terminal = 'cannot_proceed';
        terminalReason = batch.reason || 'AI could not continue from this page';
        ctx.pushLog(`Cannot proceed: ${terminalReason}`, snapshot.url, snapshot.screenshotUrl);
        break;
      }

      const actions = normalizeTestSteps(batch.actions).filter((step) => !isRedundantNavigate(step, page.url(), job.websiteUrl));
      if (!actions.length) {
        if (batch.done) {
          terminal = 'completed';
          ctx.pushLog('Goal complete — no further actions on this page', snapshot.url, snapshot.screenshotUrl);
          break;
        }
        terminal = 'cannot_proceed';
        terminalReason = batch.reason || 'AI returned no actions for this page';
        ctx.pushLog(`Cannot proceed: ${terminalReason}`, snapshot.url, snapshot.screenshotUrl);
        break;
      }

      ctx.pushLog(
        `AI planned ${actions.length} action(s) on this page${batch.expectsNavigation ? ' (then leave page)' : ''}`,
        snapshot.url,
        snapshot.screenshotUrl
      );

      const urlBeforeBatch = stripHash(page.url());
      for (let i = 0; i < actions.length; i++) {
        this.throwIfAborted(job.exploreId);
        const step = { ...actions[i], order: ctx.recordedSteps.length };
        const pagesBefore = context.pages().length;
        const urlBefore = stripHash(page.url());

        try {
          await this.executor.runStep(page, step, job.websiteUrl);
        } catch (err) {
          terminal = 'cannot_proceed';
          terminalReason = `Step failed: ${step.description} — ${(err as Error).message}`;
          ctx.pushLog(terminalReason, page.url(), snapshot.screenshotUrl);
          break;
        }

        await this.executor.waitForSettle(page);
        page = this.executor.activePage(context, page);
        const urlAfter = stripHash(page.url());
        const newTab = context.pages().length > pagesBefore;
        const leftPage = urlAfter !== urlBefore || newTab;

        ctx.recordedSteps.push(step);
        ctx.pushLog(`Ran: ${step.action} — ${step.description}`, page.url());

        if (leftPage && i < actions.length - 1) {
          ctx.pushLog('Page changed mid-batch — skipping remaining guessed steps', page.url());
          break;
        }
      }

      if (terminal) break;

      if (batch.done) {
        terminal = 'completed';
        ctx.pushLog('User goal covered — saving test case', page.url());
        break;
      }

      if (stripHash(page.url()) === urlBeforeBatch && !batch.expectsNavigation && hop === ctx.maxHops) {
        terminal = 'cannot_proceed';
        terminalReason = 'Reached hop limit on the same page';
        break;
      }
    }

    if (!terminal) {
      terminal = ctx.recordedSteps.length > 1 ? 'cannot_proceed' : 'failed';
      terminalReason = terminalReason || `Stopped after ${ctx.maxHops} page hops`;
    }

    return {
      status: terminal,
      error: terminal === 'completed' ? undefined : terminalReason,
    };
    } finally {
      await browser.close().catch(() => {});
    }
  }

  private async requestBatch(
    job: ExploreJob,
    snapshot: { url: string; title: string; elementsText: string; screenshotBase64: string; mimeType: string },
    recordedSteps: TestStep[],
    hop: number
  ): Promise<{ cancelled: boolean; batch: ExploreBatch }> {
    const res = await axios.post(
      `${this.aiServiceUrl}/api/ai/next-batch`,
      {
        exploreId: job.exploreId,
        prompt: job.prompt,
        websiteUrl: job.websiteUrl,
        currentUrl: snapshot.url,
        title: snapshot.title,
        elementsText: snapshot.elementsText,
        screenshotBase64: snapshot.screenshotBase64,
        mimeType: snapshot.mimeType,
        recordedSteps,
        hop,
      },
      { timeout: 60000 }
    );
    return {
      cancelled: !!res.data.data.cancelled,
      batch: res.data.data.batch as ExploreBatch,
    };
  }

  private async finish(exploreId: string, payload: {
    status: ExploreStatus;
    steps: TestStep[];
    hops: number;
    geminiCalls: number;
    hopLog: ExploreHopLog[];
    title?: string;
    description?: string;
    error?: string;
  }): Promise<void> {
    try {
      const res = await axios.post(`${this.aiServiceUrl}/api/ai/explore/${exploreId}/complete`, payload, { timeout: 15000 });
      const session = res.data.data;
      this.emit(exploreId, {
        status: payload.status,
        hop: payload.hops,
        maxHops: MAX_HOPS(),
        message: payload.status === 'completed'
          ? 'Test case saved from page-aware walk'
          : payload.error || payload.status,
        stepsRecorded: payload.steps.length,
        geminiCalls: payload.geminiCalls,
        error: payload.error,
        testCaseId: session?.testCaseId,
      });
    } catch (err) {
      this.logger.error('Failed to persist explore result', { exploreId, error: (err as Error).message });
      this.emit(exploreId, {
        status: 'failed',
        hop: payload.hops,
        maxHops: MAX_HOPS(),
        message: 'Failed to save explore result',
        stepsRecorded: payload.steps.length,
        geminiCalls: payload.geminiCalls,
        error: (err as Error).message,
      });
    }
  }

  private async syncProgress(exploreId: string, body: Record<string, unknown>): Promise<void> {
    try {
      await axios.post(`${this.aiServiceUrl}/api/ai/explore/${exploreId}/progress`, body, { timeout: 5000 });
    } catch {
      // live UI still gets socket events
    }
  }

  private emit(exploreId: string, partial: Omit<ExploreProgress, 'exploreId' | 'timestamp'>): void {
    this.getSocket()?.emit('explore:progress', {
      exploreId,
      ...partial,
      timestamp: new Date().toISOString(),
    } satisfies ExploreProgress);
  }

  private throwIfAborted(exploreId: string): void {
    if (this.executor.isAborted(exploreId)) {
      throw new ExecutionAbortedError('Explore aborted by user');
    }
  }
}

function stripHash(url: string): string {
  return url.split('#')[0];
}

function isRedundantNavigate(step: TestStep, currentUrl: string, websiteUrl: string): boolean {
  if (step.action !== 'navigate') return false;
  const target = stripHash(step.value || websiteUrl);
  return target === stripHash(currentUrl) || target === stripHash(websiteUrl);
}
