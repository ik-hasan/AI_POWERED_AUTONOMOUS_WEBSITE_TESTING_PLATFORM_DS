import { ExploreBatch, TestStep, TestStepAction, LocatorStrategy } from '../types';

const ACTIONS = new Set<TestStepAction>([
  'navigate', 'click', 'fill', 'hover', 'press', 'drag',
  'upload', 'download', 'assert', 'screenshot', 'wait',
]);

const STRATEGIES = new Set<LocatorStrategy>([
  'css', 'xpath', 'text', 'role', 'testId', 'label', 'placeholder',
]);

export function extractJsonObject(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const raw = fenced ? fenced[1] : text;
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('AI response did not contain JSON');
  }
  return JSON.parse(match[0]);
}

function asAction(value: unknown): TestStepAction | null {
  if (typeof value !== 'string') return null;
  const action = value.toLowerCase() as TestStepAction;
  return ACTIONS.has(action) ? action : null;
}

function coerceStep(raw: unknown, index: number): TestStep | null {
  if (!raw || typeof raw !== 'object') return null;
  const item = raw as Record<string, unknown>;
  const action = asAction(item.action);
  if (!action) return null;

  const strategyRaw = typeof item.locatorStrategy === 'string' ? item.locatorStrategy : 'css';
  const locatorStrategy = STRATEGIES.has(strategyRaw as LocatorStrategy)
    ? (strategyRaw as LocatorStrategy)
    : 'css';

  const assertionRaw = item.assertion && typeof item.assertion === 'object'
    ? (item.assertion as Record<string, unknown>)
    : undefined;

  const step: TestStep = {
    order: index,
    action,
    selector: typeof item.selector === 'string' ? item.selector : undefined,
    locatorStrategy,
    value: item.value !== undefined && item.value !== null ? String(item.value) : undefined,
    description: typeof item.description === 'string' && item.description.trim()
      ? item.description
      : `${action} ${typeof item.selector === 'string' ? item.selector : ''}`.trim(),
    timeout: typeof item.timeout === 'number' ? item.timeout : undefined,
  };

  if (assertionRaw && typeof assertionRaw.type === 'string') {
    const type = assertionRaw.type as NonNullable<TestStep['assertion']>['type'];
    step.assertion = {
      type,
      expected: (assertionRaw.expected as string | number | boolean) ?? true,
    };
  }

  return step;
}

export function parseExploreBatch(raw: unknown): ExploreBatch {
  const obj = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {};
  const actionsRaw = Array.isArray(obj.actions) ? obj.actions : [];
  const actions = actionsRaw
    .map((item, i) => coerceStep(item, i))
    .filter((s): s is TestStep => s !== null);

  return {
    title: typeof obj.title === 'string' ? obj.title : undefined,
    description: typeof obj.description === 'string' ? obj.description : undefined,
    actions,
    expectsNavigation: obj.expectsNavigation === true,
    done: obj.done === true,
    cannotProceed: obj.cannotProceed === true,
    reason: typeof obj.reason === 'string' ? obj.reason : undefined,
  };
}
