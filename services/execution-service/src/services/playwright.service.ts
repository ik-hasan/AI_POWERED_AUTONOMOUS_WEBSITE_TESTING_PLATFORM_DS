import { chromium, Browser, BrowserContext, Page, Locator } from 'playwright';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { Logger, TestStep, StepLog, ExecutionAbortedError, normalizeTestSteps, PageElement, PageSnapshot } from '@platform/shared';

export interface ExecutionResult {
  status: 'passed' | 'failed';
  stepLogs: StepLog[];
  screenshots: string[];
  errorMessage?: string;
  duration: number;
}

export interface PlaywrightOptions {
  headless?: boolean;
  slowMo?: number;
}

export class PlaywrightExecutor {
  private logger = new Logger('playwright-executor');
  private screenshotDir: string;
  private headless: boolean;
  private slowMo: number;
  private activeRuns = new Map<string, { browser: Browser | null; aborted: boolean }>();

  constructor(screenshotDir: string, options: PlaywrightOptions = {}) {
    this.screenshotDir = screenshotDir;
    this.headless = options.headless ?? true;
    this.slowMo = options.slowMo ?? 0;
    if (!fs.existsSync(screenshotDir)) {
      fs.mkdirSync(screenshotDir, { recursive: true });
    }
    this.logger.info(`Playwright mode: ${this.headless ? 'headless' : 'headed (live browser)'}`, {
      slowMo: this.slowMo,
    });
  }

  abort(executionId: string): boolean {
    const run = this.activeRuns.get(executionId);
    if (!run) return false;
    run.aborted = true;
    if (run.browser) {
      run.browser.close().catch(() => {});
    }
    return true;
  }

  private assertNotAborted(executionId?: string): void {
    if (executionId && this.activeRuns.get(executionId)?.aborted) {
      throw new ExecutionAbortedError();
    }
  }

  async execute(
    steps: TestStep[],
    websiteUrl: string,
    onProgress?: (update: {
      progress: number;
      currentStep: number;
      totalSteps: number;
      step: TestStep;
      phase: 'start' | 'done';
      durationMs?: number;
    }) => void,
    runOptions?: { headless?: boolean; executionId?: string }
  ): Promise<ExecutionResult> {
    const startTime = Date.now();
    const stepLogs: StepLog[] = [];
    const screenshots: string[] = [];
    let browser: Browser | null = null;
    const headless = runOptions?.headless ?? this.headless;
    const executionId = runOptions?.executionId;

    if (executionId) {
      this.activeRuns.set(executionId, { browser: null, aborted: false });
    }

    try {
      this.assertNotAborted(executionId);
      browser = await chromium.launch({
        headless,
        slowMo: headless ? this.slowMo : Math.max(this.slowMo, 300),
      });
      if (executionId) {
        const run = this.activeRuns.get(executionId);
        if (run) run.browser = browser;
      }

      const context = await browser.newContext({
        viewport: { width: 1280, height: 720 },
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        locale: 'en-US',
      });
      const page = await context.newPage();

      const normalizedSteps = normalizeTestSteps(steps);

      for (let i = 0; i < normalizedSteps.length; i++) {
        this.assertNotAborted(executionId);
        const step = normalizedSteps[i];
        const stepStart = Date.now();
        onProgress?.({
          progress: Math.round((i / normalizedSteps.length) * 100),
          currentStep: i + 1,
          totalSteps: normalizedSteps.length,
          step,
          phase: 'start',
        });

        try {
          await this.executeStep(page, step, websiteUrl);
          const screenshotPath = await this.captureScreenshot(page, step.order);
          if (screenshotPath) screenshots.push(screenshotPath);

          const durationMs = Date.now() - stepStart;
          onProgress?.({
            progress: Math.round(((i + 1) / normalizedSteps.length) * 100),
            currentStep: i + 1,
            totalSteps: normalizedSteps.length,
            step,
            phase: 'done',
            durationMs,
          });

          stepLogs.push({
            stepOrder: step.order,
            action: step.action,
            status: 'passed',
            message: step.description,
            duration: Date.now() - stepStart,
            screenshotUrl: screenshotPath,
            timestamp: new Date(),
          });
        } catch (stepError) {
          const screenshotPath = await this.captureScreenshot(page, step.order, 'error');
          if (screenshotPath) screenshots.push(screenshotPath);

          const retried = await this.retryStep(page, step, websiteUrl);
          if (retried) {
            stepLogs.push({
              stepOrder: step.order,
              action: step.action,
              status: 'passed',
              message: `${step.description} (retried)`,
              duration: Date.now() - stepStart,
              screenshotUrl: screenshotPath,
              timestamp: new Date(),
            });
          } else {
            stepLogs.push({
              stepOrder: step.order,
              action: step.action,
              status: 'failed',
              message: (stepError as Error).message,
              duration: Date.now() - stepStart,
              screenshotUrl: screenshotPath,
              timestamp: new Date(),
            });
            throw stepError;
          }
        }
      }

      return {
        status: 'passed',
        stepLogs,
        screenshots,
        duration: Date.now() - startTime,
      };
    } catch (err) {
      if (err instanceof ExecutionAbortedError) throw err;
      if (executionId && this.activeRuns.get(executionId)?.aborted) {
        throw new ExecutionAbortedError();
      }
      return {
        status: 'failed',
        stepLogs,
        screenshots,
        errorMessage: (err as Error).message,
        duration: Date.now() - startTime,
      };
    } finally {
      await browser?.close();
      if (executionId) this.activeRuns.delete(executionId);
    }
  }

  private async executeStep(page: Page, step: TestStep, websiteUrl: string): Promise<void> {
    const timeout = step.timeout || 10000;

    switch (step.action) {
      case 'navigate':
        await page.goto(step.value || websiteUrl, { timeout, waitUntil: 'domcontentloaded' });
        await page.waitForLoadState('networkidle', { timeout: Math.min(timeout, 15000) }).catch(() => {});
        break;
      case 'click':
        await this.safeClick(page, step, timeout);
        break;
      case 'fill':
        await this.safeFill(page, step, timeout);
        break;
      case 'hover':
        await this.getLocator(page, step).hover({ timeout });
        break;
      case 'press':
        await this.getLocator(page, step).press(step.value || 'Enter', { timeout });
        break;
      case 'drag': {
        const source = this.getLocator(page, step);
        const target = page.locator(step.value || '');
        await source.dragTo(target, { timeout });
        break;
      }
      case 'upload': {
        const fileInput = this.getLocator(page, step);
        await fileInput.setInputFiles(step.value || '', { timeout });
        break;
      }
      case 'download': {
        const [download] = await Promise.all([
          page.waitForEvent('download', { timeout }),
          this.getLocator(page, step).click({ timeout }),
        ]);
        await download.path();
        break;
      }
      case 'assert':
        await this.runAssertion(page, step, timeout);
        break;
      case 'screenshot':
        await this.captureScreenshot(page, step.order);
        break;
      case 'wait':
        await page.waitForTimeout(parseInt(step.value || '1000', 10));
        break;
      default:
        throw new Error(`Unknown action: ${step.action}`);
    }
  }

  private resolveLocator(page: Page, step: TestStep): Locator {
    if (!step.selector && step.action !== 'assert') {
      throw new Error(`Selector required for action: ${step.action}`);
    }

    const strategy = step.locatorStrategy || 'css';
    const selector = step.selector || '';

    switch (strategy) {
      case 'text':
        return page.getByText(selector, { exact: false });
      case 'role': {
        const role = selector.toLowerCase() as Parameters<Page['getByRole']>[0];
        const name = step.value?.trim();
        return name ? page.getByRole(role, { name }) : page.getByRole(role);
      }
      case 'testId':
        return page.getByTestId(selector);
      case 'label':
        return page.getByLabel(selector);
      case 'placeholder':
        return page.getByPlaceholder(selector);
      case 'xpath':
        return page.locator(`xpath=${selector}`);
      default:
        if (selector.includes(',')) {
          return page.locator(selector).first();
        }
        return page.locator(selector);
    }
  }

  private getLocator(page: Page, step: TestStep): Locator {
    return this.resolveLocator(page, step).first();
  }

  private async safeClick(page: Page, step: TestStep, timeout: number): Promise<void> {
    const candidates = this.clickCandidates(page, step);
    const perAttempt = Math.min(5000, Math.max(2000, Math.floor(timeout / candidates.length)));

    let lastError: Error | null = null;
    for (const locator of candidates) {
      try {
        const target = locator.first();
        await target.waitFor({ state: 'visible', timeout: perAttempt });
        await target.scrollIntoViewIfNeeded().catch(() => {});
        await target.click({ timeout: perAttempt, force: false });
        await page.waitForLoadState('domcontentloaded', { timeout: 5000 }).catch(() => {});
        return;
      } catch (err) {
        lastError = err as Error;
        this.logger.warn('Click attempt failed, trying fallback', {
          step: step.order,
          error: lastError.message,
        });
      }
    }
    throw lastError ?? new Error(`Could not click: ${step.description}`);
  }

  private clickCandidates(page: Page, step: TestStep): Locator[] {
    const candidates: Locator[] = [this.resolveLocator(page, step)];
    const label = (step.value || step.selector || '').trim();

    if (label && !/[#.\[\]>=:~]/.test(label)) {
      candidates.push(
        page.getByRole('link', { name: label }),
        page.getByRole('button', { name: label }),
        page.getByText(label, { exact: false })
      );
    }

    return candidates;
  }

  private async safeFill(page: Page, step: TestStep, timeout: number): Promise<void> {
    const locator = this.getLocator(page, step);
    await locator.waitFor({ state: 'visible', timeout });
    await locator.fill(step.value || '', { timeout });
  }

  private async runAssertion(page: Page, step: TestStep, timeout: number): Promise<void> {
    if (!step.assertion) throw new Error('Assertion config required');

    switch (step.assertion.type) {
      case 'visible': {
        const loc = this.getLocator(page, step);
        await loc.waitFor({ state: 'visible', timeout });
        break;
      }
      case 'hidden': {
        const loc = this.getLocator(page, step);
        await loc.waitFor({ state: 'hidden', timeout });
        break;
      }
      case 'text': {
        const loc = this.getLocator(page, step);
        await loc.waitFor({ state: 'visible', timeout });
        const text = await loc.textContent();
        if (!text?.includes(String(step.assertion.expected))) {
          throw new Error(`Expected text "${step.assertion.expected}" but got "${text}"`);
        }
        break;
      }
      case 'value': {
        const loc = this.getLocator(page, step);
        const value = await loc.inputValue();
        if (value !== String(step.assertion.expected)) {
          throw new Error(`Expected value "${step.assertion.expected}" but got "${value}"`);
        }
        break;
      }
      case 'url':
        if (!page.url().includes(String(step.assertion.expected))) {
          throw new Error(`Expected URL to contain "${step.assertion.expected}"`);
        }
        break;
      case 'count': {
        const loc = step.selector ? this.getLocator(page, step) : page.locator('body');
        const count = await loc.count();
        if (count !== Number(step.assertion.expected)) {
          throw new Error(`Expected count ${step.assertion.expected} but got ${count}`);
        }
        break;
      }
    }
  }

  private async retryStep(page: Page, step: TestStep, websiteUrl: string, maxRetries = 2): Promise<boolean> {
    for (let i = 0; i < maxRetries; i++) {
      try {
        await page.waitForTimeout(1000 * (i + 1));
        await this.executeStep(page, step, websiteUrl);
        return true;
      } catch {
        this.logger.warn(`Retry ${i + 1} failed for step ${step.order}`);
      }
    }
    return false;
  }

  startTrackedRun(runId: string): void {
    this.activeRuns.set(runId, { browser: null, aborted: false });
  }

  attachBrowser(runId: string, browser: Browser): void {
    const run = this.activeRuns.get(runId);
    if (run) run.browser = browser;
  }

  endTrackedRun(runId: string): void {
    this.activeRuns.delete(runId);
  }

  isAborted(runId?: string): boolean {
    return !!(runId && this.activeRuns.get(runId)?.aborted);
  }

  async launchBrowser(headless?: boolean): Promise<Browser> {
    const useHeadless = headless ?? this.headless;
    return chromium.launch({
      headless: useHeadless,
      slowMo: useHeadless ? this.slowMo : Math.max(this.slowMo, 300),
    });
  }

  async newPage(browser: Browser): Promise<{ context: BrowserContext; page: Page }> {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-US',
    });
    const page = await context.newPage();
    return { context, page };
  }

  activePage(context: BrowserContext, current: Page): Page {
    const pages = context.pages().filter((p) => !p.isClosed());
    return pages[pages.length - 1] || current;
  }

  async runStep(page: Page, step: TestStep, websiteUrl: string): Promise<void> {
    await this.executeStep(page, step, websiteUrl);
  }

  async waitForSettle(page: Page, timeout = 8000): Promise<void> {
    await page.waitForLoadState('domcontentloaded', { timeout }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: Math.min(timeout, 5000) }).catch(() => {});
    await page.waitForTimeout(400);
  }

  async capturePageSnapshot(page: Page, hop: number): Promise<PageSnapshot> {
    const buffer = await page.screenshot({ type: 'jpeg', quality: 55, fullPage: false });
    const filename = `explore-hop-${hop}-${uuidv4()}.jpg`;
    const filepath = path.join(this.screenshotDir, filename);
    fs.writeFileSync(filepath, buffer);

    const elements = await this.collectElements(page);
    return {
      url: page.url(),
      title: await page.title().catch(() => ''),
      elements,
      elementsText: formatElementsText(elements),
      screenshotBase64: buffer.toString('base64'),
      mimeType: 'image/jpeg',
      screenshotUrl: `/api/screenshots/${filename}`,
    };
  }

  private async collectElements(page: Page): Promise<PageElement[]> {
    return page.evaluate(`(() => {
      const visible = (el) => {
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
      };
      const nodes = Array.from(document.querySelectorAll(
        'a, button, input, select, textarea, [role="button"], [role="link"], [role="textbox"], [role="tab"], h1, h2, h3'
      ));
      const out = [];
      for (const node of nodes) {
        if (!visible(node)) continue;
        const labelled = node.labels && node.labels[0] ? node.labels[0].innerText.trim() : '';
        const name = (node.getAttribute('aria-label') || labelled || node.innerText || '').trim().slice(0, 80);
        out.push({
          tag: node.tagName.toLowerCase(),
          role: node.getAttribute('role') || undefined,
          name: name || undefined,
          type: node.getAttribute('type') || undefined,
          placeholder: node.getAttribute('placeholder') || undefined,
          href: (node.getAttribute('href') || '').slice(0, 120) || undefined,
          id: node.id || undefined,
          testId: node.getAttribute('data-testid') || undefined,
        });
        if (out.length >= 80) break;
      }
      return out;
    })()`) as Promise<PageElement[]>;
  }

  private async captureScreenshot(page: Page, stepOrder: number, suffix = ''): Promise<string> {
    const filename = `step-${stepOrder}-${uuidv4()}${suffix ? `-${suffix}` : ''}.png`;
    const filepath = path.join(this.screenshotDir, filename);
    await page.screenshot({ path: filepath, fullPage: false });
    return `/api/screenshots/${filename}`;
  }
}

function formatElementsText(elements: PageElement[]): string {
  if (!elements.length) return '(no interactive elements detected)';
  return elements
    .map((el, i) => {
      const bits = [`${i + 1}. <${el.tag}>`];
      if (el.role) bits.push(`role=${el.role}`);
      if (el.type) bits.push(`type=${el.type}`);
      if (el.name) bits.push(`name="${el.name}"`);
      if (el.placeholder) bits.push(`placeholder="${el.placeholder}"`);
      if (el.id) bits.push(`id=${el.id}`);
      if (el.testId) bits.push(`testId=${el.testId}`);
      if (el.href) bits.push(`href=${el.href}`);
      return bits.join(' ');
    })
    .join('\n')
    .slice(0, 8000);
}
