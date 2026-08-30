import mongoose, { Schema, Document } from 'mongoose';
import { ExecutionStatus } from '@platform/shared';

export interface IExecutionDocument extends Document {
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
  progress: number;
  currentStep: number;
  totalSteps: number;
  createdAt: Date;
}

const executionSchema = new Schema<IExecutionDocument>(
  {
    testCaseId: { type: String, required: true, index: true },
    projectId: { type: String, required: true, index: true },
    websiteId: { type: String, required: true },
    status: { type: String, enum: ['queued', 'running', 'passed', 'failed', 'cancelled', 'retrying'], default: 'queued' },
    startedAt: Date,
    completedAt: Date,
    duration: Number,
    retryCount: { type: Number, default: 0 },
    maxRetries: { type: Number, default: 2 },
    parallelWorkers: { type: Number, default: 1 },
    triggeredBy: { type: String, required: true },
    progress: { type: Number, default: 0 },
    currentStep: { type: Number, default: 0 },
    totalSteps: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const ExecutionModel = mongoose.model<IExecutionDocument>('Execution', executionSchema);
