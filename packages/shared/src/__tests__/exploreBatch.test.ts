import { extractJsonObject, parseExploreBatch } from '../utils/exploreBatch';

describe('parseExploreBatch', () => {
  it('parses a same-page action batch', () => {
    const batch = parseExploreBatch({
      actions: [
        { action: 'fill', selector: 'Email', locatorStrategy: 'label', value: 'a@b.com', description: 'Fill email' },
        { action: 'fill', selector: 'Password', locatorStrategy: 'label', value: 'secret', description: 'Fill password' },
        { action: 'click', selector: 'button', locatorStrategy: 'role', value: 'Log in', description: 'Submit' },
      ],
      expectsNavigation: true,
      done: false,
    });
    expect(batch.actions).toHaveLength(3);
    expect(batch.expectsNavigation).toBe(true);
    expect(batch.done).toBe(false);
    expect(batch.actions[0].action).toBe('fill');
  });

  it('drops invalid actions and reads cannotProceed', () => {
    const batch = parseExploreBatch({
      actions: [{ action: 'teleport' }, { action: 'click', selector: '#go', description: 'Go' }],
      cannotProceed: true,
      reason: 'Captcha',
    });
    expect(batch.actions).toHaveLength(1);
    expect(batch.cannotProceed).toBe(true);
    expect(batch.reason).toBe('Captcha');
  });

  it('extracts JSON from fenced markdown', () => {
    const parsed = extractJsonObject('```json\n{"done":true,"actions":[]}\n```');
    expect(parsed).toEqual({ done: true, actions: [] });
  });
});
