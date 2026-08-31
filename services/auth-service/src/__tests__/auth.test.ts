import { registerSchema, loginSchema } from '@platform/shared';

describe('Auth validators', () => {
  it('validates registration input', () => {
    const result = registerSchema.safeParse({
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid email', () => {
    const result = registerSchema.safeParse({
      email: 'invalid',
      password: 'password123',
      name: 'Test',
    });
    expect(result.success).toBe(false);
  });

  it('validates login input', () => {
    const result = loginSchema.safeParse({
      email: 'test@example.com',
      password: 'password',
    });
    expect(result.success).toBe(true);
  });
});
