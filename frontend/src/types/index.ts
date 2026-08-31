export interface User {
  id: string;
  email: string;
  name: string;
}

export interface Project {
  _id: string;
  name: string;
  description: string;
  ownerId: string;
  members: string[];
  createdAt: string;
}

export interface Website {
  _id: string;
  projectId: string;
  name: string;
  url: string;
  description?: string;
}

export interface TestStep {
  order: number;
  action: string;
  selector?: string;
  locatorStrategy?: string;
  value?: string;
  description: string;
  timeout?: number;
  assertion?: { type: string; expected: string | number | boolean };
}

export interface TestCase {
  _id: string;
  projectId: string;
  websiteId: string;
  title: string;
  description: string;
  naturalLanguagePrompt?: string;
  steps: TestStep[];
  status: string;
  generatedBy?: 'prompt' | 'explore' | 'manual';
  exploreMeta?: { exploreId: string; hops: number; geminiCalls: number };
  createdAt: string;
}

export interface ExploreHopLog {
  hop: number;
  url: string;
  message: string;
  screenshotUrl?: string;
  timestamp: string;
}

export interface ExploreSession {
  _id: string;
  projectId: string;
  websiteId: string;
  websiteUrl: string;
  prompt: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cannot_proceed' | 'cancelled';
  hops: number;
  geminiCalls: number;
  recordedSteps: TestStep[];
  hopLog: ExploreHopLog[];
  testCaseId?: string;
  error?: string;
}

export interface ExploreUpdate {
  exploreId: string;
  status: string;
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

export interface Execution {
  _id: string;
  testCaseId: string;
  projectId: string;
  status: string;
  progress: number;
  currentStep: number;
  totalSteps: number;
  duration?: number;
  createdAt: string;
}

export interface StepLog {
  stepOrder: number;
  action: string;
  status: string;
  message: string;
  duration: number;
  screenshotUrl?: string;
  timestamp: string;
}

export interface Report {
  _id: string;
  executionId: string;
  testCaseId: string;
  projectId: string;
  title: string;
  status: string;
  stepLogs: StepLog[];
  errorMessage?: string;
  screenshots: string[];
  metrics: {
    totalSteps: number;
    passedSteps: number;
    failedSteps: number;
    duration: number;
  };
  createdAt: string;
}

export interface AnalyticsSummary {
  totalExecutions: number;
  passedExecutions: number;
  failedExecutions: number;
  averageDuration: number;
  successRate: number;
  executionsByDay: { date: string; count: number; passed: number; failed: number }[];
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface ExecutionUpdate {
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
