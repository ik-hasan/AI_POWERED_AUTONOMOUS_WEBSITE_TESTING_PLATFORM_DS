import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  name: z.string().min(2, 'Name must be at least 2 characters'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const projectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(100),
  description: z.string().max(500).optional().default(''),
});

export const websiteSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).max(100),
  url: z.string().url('Invalid URL'),
  description: z.string().max(500).optional(),
});

export const testStepSchema = z.object({
  order: z.number().int().min(0),
  action: z.enum([
    'navigate', 'click', 'fill', 'hover', 'press', 'drag',
    'upload', 'download', 'assert', 'screenshot', 'wait',
  ]),
  selector: z.string().optional(),
  locatorStrategy: z.enum(['css', 'xpath', 'text', 'role', 'testId', 'label', 'placeholder']).optional(),
  value: z.string().optional(),
  description: z.string().min(1),
  timeout: z.number().int().positive().optional(),
  assertion: z.object({
    type: z.enum(['visible', 'hidden', 'text', 'value', 'url', 'count']),
    expected: z.union([z.string(), z.number(), z.boolean()]),
  }).optional(),
});

export const testCaseSchema = z.object({
  projectId: z.string().min(1),
  websiteId: z.string().min(1),
  title: z.string().min(1).max(200),
  description: z.string().max(1000).optional().default(''),
  steps: z.array(testStepSchema).min(1, 'At least one step is required'),
});

export const generateTestSchema = z.object({
  projectId: z.string().min(1),
  websiteId: z.string().min(1),
  websiteUrl: z.string().url(),
  prompt: z.string().min(10, 'Prompt must be at least 10 characters'),
  title: z.string().min(1).max(200).optional(),
});

export const exploreTestSchema = generateTestSchema.extend({
  headless: z.boolean().optional().default(true),
});

export const exploreNextBatchSchema = z.object({
  exploreId: z.string().min(1),
  prompt: z.string().min(10),
  websiteUrl: z.string().url(),
  currentUrl: z.string().min(1),
  title: z.string().optional().default(''),
  elementsText: z.string().min(1),
  screenshotBase64: z.string().min(20),
  mimeType: z.string().optional().default('image/jpeg'),
  recordedSteps: z.array(testStepSchema),
  hop: z.number().int().min(0),
});

export const exploreCompleteSchema = z.object({
  status: z.enum(['completed', 'failed', 'cannot_proceed', 'cancelled']),
  steps: z.array(testStepSchema).optional().default([]),
  hops: z.number().int().min(0),
  geminiCalls: z.number().int().min(0),
  hopLog: z.array(z.object({
    hop: z.number().int().min(0),
    url: z.string(),
    message: z.string(),
    screenshotUrl: z.string().optional(),
    timestamp: z.string(),
  })).optional().default([]),
  title: z.string().optional(),
  description: z.string().optional(),
  error: z.string().optional(),
});

export const executeTestSchema = z.object({
  testCaseId: z.string().min(1),
  parallelWorkers: z.number().int().min(1).max(10).optional().default(1),
  maxRetries: z.number().int().min(0).max(5).optional().default(2),
  headless: z.boolean().optional().default(true),
});

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).optional().default(1),
  limit: z.coerce.number().int().min(1).max(100).optional().default(20),
  search: z.string().optional(),
  status: z.string().optional(),
  projectId: z.string().optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ProjectInput = z.infer<typeof projectSchema>;
export type WebsiteInput = z.infer<typeof websiteSchema>;
export type TestCaseInput = z.infer<typeof testCaseSchema>;
export type GenerateTestInput = z.infer<typeof generateTestSchema>;
export type ExploreTestInput = z.infer<typeof exploreTestSchema>;
export type ExploreNextBatchInput = z.infer<typeof exploreNextBatchSchema>;
export type ExploreCompleteInput = z.infer<typeof exploreCompleteSchema>;
export type ExecuteTestInput = z.infer<typeof executeTestSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;
