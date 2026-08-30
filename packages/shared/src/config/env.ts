import { Logger } from '../utils/logger';

const PLACEHOLDER_SECRETS = new Set([
  'secret',
  'refresh-secret',
  'dev-jwt-secret',
  'dev-refresh-secret',
  'your-super-secret-jwt-key-change-in-production',
  'your-super-secret-refresh-key-change-in-production',
  'change-this-to-a-long-random-secret',
  'change-this-to-another-long-random-secret',
  'your-gemini-api-key',
]);

export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production';
}

export function isValidSecret(value: string | undefined): boolean {
  return !!value && value.length >= 16 && !PLACEHOLDER_SECRETS.has(value);
}

export function isValidGeminiKey(value: string | undefined): boolean {
  return !!value && value.length > 10 && !PLACEHOLDER_SECRETS.has(value);
}

export function allowAiFallback(): boolean {
  return process.env.ALLOW_AI_FALLBACK === 'true';
}

export interface ServiceEnvRequirements {
  service: string;
  required: string[];
  productionOnly?: string[];
}

export function validateServiceEnv(requirements: ServiceEnvRequirements): void {
  const logger = new Logger('env-validation');
  const missing: string[] = [];

  for (const key of requirements.required) {
    if (!process.env[key]) missing.push(key);
  }

  if (isProduction()) {
    for (const key of requirements.productionOnly ?? []) {
      if (!process.env[key]) missing.push(key);
    }

    if (requirements.service === 'auth-service') {
      if (!isValidSecret(process.env.JWT_SECRET)) missing.push('JWT_SECRET (must be a strong non-default value)');
      if (!isValidSecret(process.env.JWT_REFRESH_SECRET)) missing.push('JWT_REFRESH_SECRET (must be a strong non-default value)');
    }

    if (requirements.service === 'ai-service') {
      if (!isValidGeminiKey(process.env.GEMINI_API_KEY)) {
        missing.push('GEMINI_API_KEY (required for AI test generation in production)');
      }
    }
  }

  if (missing.length > 0) {
    const message = `[${requirements.service}] Missing or invalid environment variables: ${missing.join(', ')}`;
    logger.error(message);
    throw new Error(message);
  }

  logger.info(`[${requirements.service}] Environment validation passed`);
}
