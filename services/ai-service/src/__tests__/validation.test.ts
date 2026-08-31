import { validateTestSteps } from '../repositories/testCase.repository';
import { TestStep } from '@platform/shared';

describe('Test step validation', () => {
  const validSteps: TestStep[] = [
    { order: 0, action: 'navigate', value: 'https://example.com', description: 'Navigate' },
    { order: 1, action: 'click', selector: '#btn', locatorStrategy: 'css', description: 'Click button' },
    { order: 2, action: 'assert', selector: 'h1', locatorStrategy: 'css', description: 'Check title', assertion: { type: 'visible', expected: true } },
  ];

  it('validates correct steps', () => {
    const result = validateTestSteps(validSteps);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('rejects click without selector', () => {
    const result = validateTestSteps([
      { order: 0, action: 'click', description: 'Click' },
    ]);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('rejects navigate without URL', () => {
    const result = validateTestSteps([
      { order: 0, action: 'navigate', description: 'Navigate' },
    ]);
    expect(result.valid).toBe(false);
  });
});
