import { normalizeTestSteps } from '../utils/stepNormalize';

describe('normalizeTestSteps', () => {
  it('rewrites css visible-text selectors to text strategy', () => {
    const [step] = normalizeTestSteps([
      { order: 0, action: 'click', selector: 'Get started', locatorStrategy: 'css', description: 'Click CTA' },
    ]);
    expect(step.locatorStrategy).toBe('text');
    expect(step.selector).toBe('Get started');
  });

  it('keeps real css selectors', () => {
    const [step] = normalizeTestSteps([
      { order: 0, action: 'click', selector: '#submit-btn', locatorStrategy: 'css', description: 'Click submit' },
    ]);
    expect(step.locatorStrategy).toBe('css');
  });
});
