export type UserRole = 'admin' | 'editor' | 'viewer';

export interface User {
  _id: string;
  email: string;
  name: string;
  role: UserRole;
  createdAt: Date;
  updatedAt: Date;
}

export interface Project {
  _id: string;
  name: string;
  description: string;
  ownerId: string;
  members: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Website {
  _id: string;
  projectId: string;
  name: string;
  url: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export type TestStepAction =
  | 'navigate'
  | 'click'
  | 'fill'
  | 'hover'
  | 'press'
  | 'drag'
  | 'upload'
  | 'download'
  | 'assert'
  | 'screenshot'
  | 'wait';

export type LocatorStrategy = 'css' | 'xpath' | 'text' | 'role' | 'testId' | 'label' | 'placeholder';

export interface TestStep {
  order: number;
  action: TestStepAction;
  selector?: string;
  locatorStrategy?: LocatorStrategy;
  value?: string;
  description: string;
  timeout?: number;
  assertion?: {
    type: 'visible' | 'hidden' | 'text' | 'value' | 'url' | 'count';
    expected: string | number | boolean;
  };
}

export type TestCaseOrigin = 'prompt' | 'explore' | 'manual';

export interface TestCase {
  _id: string;
  projectId: string;
  websiteId: string;
  title: string;
  description: string;
  naturalLanguagePrompt?: string;
  steps: TestStep[];
  createdBy: string;
  status: 'draft' | 'ready' | 'archived';
  generatedBy?: TestCaseOrigin;
  exploreMeta?: {
    exploreId: string;
    hops: number;
    geminiCalls: number;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface PageElement {
  tag: string;
  role?: string;
  name?: string;
  type?: string;
  placeholder?: string;
  href?: string;
  id?: string;
  testId?: string;
}

export interface PageSnapshot {
  url: string;
  title: string;
  elements: PageElement[];
  elementsText: string;
  screenshotBase64: string;
  mimeType: string;
  screenshotUrl?: string;
}

export interface ExploreBatch {
  title?: string;
  description?: string;
  actions: TestStep[];
  expectsNavigation: boolean;
  done: boolean;
  cannotProceed: boolean;
  reason?: string;
}

export type ExploreStatus =
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'cannot_proceed'
  | 'cancelled';

export interface ExploreHopLog {
  hop: number;
  url: string;
  message: string;
  screenshotUrl?: string;
  timestamp: string;
}

export interface ExploreProgress {
  exploreId: string;
  status: ExploreStatus;
  hop: number;
  maxHops: number;
  message: string;
  url?: string;
  screenshotUrl?: string;
  stepsRecorded: number;
  geminiCalls: number;
  error?: string;
  testCaseId?: string;
  timestamp: string;
}

export interface ExploreJob {
  exploreId: string;
  projectId: string;
  websiteId: string;
  websiteUrl: string;
  prompt: string;
  title?: string;
  userId: string;
  headless?: boolean;
}

export type ExecutionStatus = 'queued' | 'running' | 'passed' | 'failed' | 'cancelled' | 'retrying';

export interface StepLog {
  stepOrder: number;
  action: string;
  status: 'passed' | 'failed' | 'skipped';
  message: string;
  duration: number;
  screenshotUrl?: string;
  timestamp: Date;
}

export interface Execution {
  _id: string;
  testCaseId: string;
  projectId: string;
  websiteId: string;
  status: ExecutionStatus;
  startedAt?: Date;
  completedAt?: Date;
  duration?: number;
  retryCount: number;
  maxRetries: number;
  parallelWorkers: number;
  triggeredBy: string;
  createdAt: Date;
}

export interface Report {
  _id: string;
  executionId: string;
  testCaseId: string;
  projectId: string;
  title: string;
  status: ExecutionStatus;
  stepLogs: StepLog[];
  errorMessage?: string;
  screenshots: string[];
  metrics: {
    totalSteps: number;
    passedSteps: number;
    failedSteps: number;
    duration: number;
  };
  createdAt: Date;
}

export interface ExecutionJob {
  executionId: string;
  testCaseId: string;
  websiteUrl: string;
  steps: TestStep[];
  parallelWorkers: number;
  retryCount: number;
  maxRetries: number;
  triggeredBy: string;
  headless?: boolean;
}

export interface ExecutionProgress {
  executionId: string;
  status: string;
  progress: number;
  currentStep: number;
  totalSteps: number;
  stepAction?: string;
  stepActivity?: string;
  phase?: 'start' | 'done' | 'complete';
  durationMs?: number;
  error?: string;
  timestamp: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface JwtPayload {
  userId: string;
  email: string;
  role: UserRole;
}

export interface AnalyticsSummary {
  totalExecutions: number;
  passedExecutions: number;
  failedExecutions: number;
  averageDuration: number;
  successRate: number;
  executionsByDay: { date: string; count: number; passed: number; failed: number }[];
}
