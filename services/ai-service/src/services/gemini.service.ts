import { GoogleGenerativeAI } from '@google/generative-ai';
import Redis from 'ioredis';
import crypto from 'crypto';
import {
  Logger,
  TestStep,
  isValidGeminiKey,
  allowAiFallback,
  normalizeTestSteps,
  extractJsonObject,
  parseExploreBatch,
  ExploreBatch,
} from '@platform/shared';
import { validateTestSteps } from '../repositories/testCase.repository';

const SYSTEM_PROMPT = `You are an expert QA automation engineer. Read a plain-language test description for ANY website and turn it into a precise, executable sequence of Playwright test steps that FULLY covers what the user asked for.

Understand the user's intent first:
- Identify every distinct action and every expected outcome in the description (navigation, typing, clicking, waiting, and the results to verify).
- Produce steps for the COMPLETE flow in the correct order. Do not skip implied steps (e.g. waiting for content to load, or asserting the result of an action).
- Do NOT invent actions the user did not ask for.
- Do NOT assume any particular website's HTML/markup unless the description explicitly mentions it. Work for any site generically.

Return ONLY valid JSON (no markdown, no comments) with this structure:
{
  "title": "Test case title",
  "description": "Brief description",
  "steps": [
    {
      "order": 0,
      "action": "navigate|click|fill|hover|press|drag|upload|download|assert|screenshot|wait",
      "selector": "locator (meaning depends on locatorStrategy)",
      "locatorStrategy": "css|xpath|text|role|testId|label|placeholder",
      "value": "input value, accessible name, or URL",
      "description": "Human readable step description",
      "timeout": 30000,
      "assertion": { "type": "visible|hidden|text|value|url|count", "expected": "expected value" }
    }
  ]
}

Locator rules (VERY IMPORTANT — the executor depends on these being correct):
- Pick locatorStrategy by what is stable on the real page, preferring: role > label > placeholder > testId > css > xpath > text
- Each strategy uses selector/value differently:
  * role: selector = the ARIA role ONLY (button, link, textbox, checkbox, heading, tab, ...); value = the visible/accessible name.
  * label: selector = the input's visible label text.
  * placeholder: selector = the input's placeholder text.
  * testId: selector = the data-testid value.
  * css: selector = a standard CSS selector (prefer #id, [name=...], [data-*], or other stable attributes).
  * xpath: selector = an XPath expression.
  * text: selector = visible text; use ONLY for non-interactive text checks, never for clicking.
- NEVER put a visible label/name inside the role selector. The role selector is ONLY the role name.
  Wrong: { "locatorStrategy": "role", "selector": "Submit" }
  Right: { "locatorStrategy": "role", "selector": "button", "value": "Submit" }
- For clicks on buttons/links, prefer role + accessible name over fragile CSS or :has-text().
- For form fields, prefer label, placeholder, or css with name/id over a generic input[type=...] alone.
- Put the text to type in "value" for fill actions. Put the URL in "value" for navigate actions.

Step guidance:
- Start with a navigate step to the target URL.
- Add a short wait (1500-3000ms) after navigation or after actions that load content dynamically.
- After important actions, add assertions that verify the outcome the user described.
- Add screenshot steps at key verification points.
- Order steps sequentially starting from 0.`;

const EXPLORE_SYSTEM_PROMPT = `You are a QA agent walking a live website. You see ONLY the current page (screenshot + interactive elements). Decide the next batch of Playwright actions for THIS page only.

Rules:
- Return actions that can be completed with elements visible on THIS page toward the user's goal.
- Include every same-page action needed before leaving (e.g. fill email, fill password, click Login) in ONE batch.
- The last action may be the one that navigates away (click a link/submit). Set expectsNavigation=true if so.
- NEVER invent selectors or actions for a page you have not seen.
- NEVER repeat actions already listed in recordedSteps.
- For fill, prefer locatorStrategy label, placeholder, or css (id/name). Do not use role for fill — value is the text to type.
- For clicks on links/buttons, MUST use locatorStrategy "role". selector is ONLY the role (link or button). value is the visible accessible name on that page.
  Right: { "action": "click", "locatorStrategy": "role", "selector": "link", "value": "<accessible name from this snapshot>" }
  Wrong: { "locatorStrategy": "css", "selector": "<visible label>" } — that is treated as a CSS tag name and will fail.
- Never put visible text in a CSS selector. Always use role, label, placeholder, testId, or a real CSS/XPath locator from the snapshot.
- If the user goal is fully satisfied by this page (including a final assert), set done=true.
- If you cannot continue (captcha, missing login data, element not on this page and no way forward), set cannotProceed=true and explain in reason.
- Do not add a navigate to the starting URL if recordedSteps already navigated there.

Return ONLY valid JSON:
{
  "title": "short test title (optional until done)",
  "description": "brief description (optional until done)",
  "actions": [
    {
      "action": "click|fill|hover|press|assert|screenshot|wait|navigate",
      "selector": "locator",
      "locatorStrategy": "css|xpath|text|role|testId|label|placeholder",
      "value": "typed text, accessible name, URL, or key",
      "description": "what this step does",
      "timeout": 15000,
      "assertion": { "type": "visible|hidden|text|value|url|count", "expected": "..." }
    }
  ],
  "expectsNavigation": false,
  "done": false,
  "cannotProceed": false,
  "reason": ""
}`;

export class GeminiNotConfiguredError extends Error {
  constructor() {
    super(
      'GEMINI_API_KEY is not configured. Add a valid Google Gemini API key to enable AI test generation. ' +
      'Get one at https://aistudio.google.com/apikey'
    );
    this.name = 'GeminiNotConfiguredError';
  }
}

export class GeminiGenerationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GeminiGenerationError';
  }
}

export class GeminiService {
  private genAI: GoogleGenerativeAI | null = null;
  private logger = new Logger('gemini-service');

  constructor(private readonly apiKey: string) {
    if (isValidGeminiKey(apiKey)) {
      this.genAI = new GoogleGenerativeAI(apiKey);
    }
  }

  isConfigured(): boolean {
    return this.genAI !== null;
  }

  async generateTestPlan(prompt: string, websiteUrl: string): Promise<{ title: string; description: string; steps: TestStep[] }> {
    if (!this.genAI) {
      if (allowAiFallback()) {
        this.logger.warn('GEMINI_API_KEY not set — using dev fallback (ALLOW_AI_FALLBACK=true only)');
        return this.fallbackGenerator(prompt, websiteUrl);
      }
      throw new GeminiNotConfiguredError();
    }

    try {
      const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      const model = this.genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent([
        SYSTEM_PROMPT,
        `Website URL: ${websiteUrl}\n\nTest Description:\n${prompt}`,
      ]);
      const text = result.response.text();
      let parsed: { title?: string; description?: string; steps?: TestStep[] };
      try {
        parsed = extractJsonObject(text) as { title?: string; description?: string; steps?: TestStep[] };
      } catch {
        throw new GeminiGenerationError('AI returned an invalid response. Please refine your prompt and try again.');
      }
      if (!Array.isArray(parsed.steps) || parsed.steps.length === 0) {
        throw new GeminiGenerationError('AI did not generate any test steps. Please provide a more detailed prompt.');
      }

      const validation = validateTestSteps(parsed.steps);
      if (!validation.valid) {
        this.logger.warn('AI generated steps with validation issues', { errors: validation.errors });
      }

      return {
        title: parsed.title || 'Generated Test',
        description: parsed.description || prompt,
        steps: normalizeTestSteps(parsed.steps.map((s: TestStep, i: number) => ({ ...s, order: i }))),
      };
    } catch (err) {
      if (err instanceof GeminiNotConfiguredError || err instanceof GeminiGenerationError) throw err;
      this.logger.error('Gemini API error', { error: (err as Error).message });
      throw new GeminiGenerationError(
        `AI generation failed: ${(err as Error).message}. Verify your GEMINI_API_KEY and try again.`
      );
    }
  }

  async decideNextBatch(input: {
    prompt: string;
    websiteUrl: string;
    currentUrl: string;
    title: string;
    elementsText: string;
    screenshotBase64: string;
    mimeType: string;
    recordedSteps: TestStep[];
    hop: number;
  }): Promise<ExploreBatch> {
    if (!this.genAI) {
      throw new GeminiNotConfiguredError();
    }

    try {
      const modelName = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
      const model = this.genAI.getGenerativeModel({ model: modelName });
      const doneSummary = input.recordedSteps
        .map((s) => `${s.order}. ${s.action} ${s.description}`)
        .join('\n') || '(none yet)';

      const userText = [
        `User goal: ${input.prompt}`,
        `Start URL: ${input.websiteUrl}`,
        `Current URL: ${input.currentUrl}`,
        `Page title: ${input.title || '(none)'}`,
        `Hop: ${input.hop}`,
        ``,
        `Already recorded steps:`,
        doneSummary,
        ``,
        `Visible interactive elements on THIS page:`,
        input.elementsText,
      ].join('\n');

      const result = await model.generateContent([
        { text: EXPLORE_SYSTEM_PROMPT },
        { text: userText },
        {
          inlineData: {
            mimeType: input.mimeType || 'image/jpeg',
            data: input.screenshotBase64,
          },
        },
      ]);

      const text = result.response.text();
      const batch = parseExploreBatch(extractJsonObject(text));
      batch.actions = normalizeTestSteps(batch.actions);
      return batch;
    } catch (err) {
      if (err instanceof GeminiNotConfiguredError || err instanceof GeminiGenerationError) throw err;
      this.logger.error('Gemini explore batch failed', { error: (err as Error).message });
      throw new GeminiGenerationError(
        `Page-aware AI step failed: ${(err as Error).message}. Verify your GEMINI_API_KEY and try again.`
      );
    }
  }

  /** Dev-only basic plan when ALLOW_AI_FALLBACK=true — not used in production */
  private fallbackGenerator(prompt: string, websiteUrl: string): { title: string; description: string; steps: TestStep[] } {
    const title = prompt.slice(0, 80) + (prompt.length > 80 ? '...' : '');
    return {
      title,
      description: prompt,
      steps: [
        { order: 0, action: 'navigate', value: websiteUrl, description: `Navigate to ${websiteUrl}`, locatorStrategy: 'css' },
        { order: 1, action: 'wait', value: '2000', description: 'Wait for page to load', timeout: 5000 },
        { order: 2, action: 'screenshot', description: 'Capture initial page state' },
        { order: 3, action: 'assert', selector: 'body', locatorStrategy: 'css', description: 'Verify page loaded', assertion: { type: 'visible', expected: true } },
      ],
    };
  }
}

export class TestPlanCache {
  constructor(private readonly redis: Redis) {}

  private cacheKey(prompt: string, url: string): string {
    return `testplan:${crypto.createHash('sha256').update(`${prompt}:${url}`).digest('hex')}`;
  }

  async get(prompt: string, url: string) {
    const cached = await this.redis.get(this.cacheKey(prompt, url));
    return cached ? JSON.parse(cached) : null;
  }

  async set(prompt: string, url: string, plan: unknown, ttl = 3600) {
    await this.redis.setex(this.cacheKey(prompt, url), ttl, JSON.stringify(plan));
  }
}
