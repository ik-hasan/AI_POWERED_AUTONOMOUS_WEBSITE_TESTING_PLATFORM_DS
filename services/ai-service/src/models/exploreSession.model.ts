import mongoose, { Schema, Document } from 'mongoose';
import { ExploreHopLog, ExploreStatus, TestStep } from '@platform/shared';

export interface IExploreSessionDocument extends Document {
  projectId: string;
  websiteId: string;
  websiteUrl: string;
  prompt: string;
  title?: string;
  createdBy: string;
  status: ExploreStatus;
  hops: number;
  geminiCalls: number;
  recordedSteps: TestStep[];
  hopLog: ExploreHopLog[];
  testCaseId?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const testStepSchema = new Schema({
  order: { type: Number, required: true },
  action: { type: String, required: true },
  selector: String,
  locatorStrategy: String,
  value: String,
  description: { type: String, required: true },
  timeout: Number,
  assertion: {
    type: { type: String },
    expected: Schema.Types.Mixed,
  },
}, { _id: false });

const hopLogSchema = new Schema({
  hop: { type: Number, required: true },
  url: { type: String, required: true },
  message: { type: String, required: true },
  screenshotUrl: String,
  timestamp: { type: String, required: true },
}, { _id: false });

const exploreSessionSchema = new Schema<IExploreSessionDocument>(
  {
    projectId: { type: String, required: true, index: true },
    websiteId: { type: String, required: true },
    websiteUrl: { type: String, required: true },
    prompt: { type: String, required: true },
    title: String,
    createdBy: { type: String, required: true },
    status: {
      type: String,
      enum: ['queued', 'running', 'completed', 'failed', 'cannot_proceed', 'cancelled'],
      default: 'queued',
      index: true,
    },
    hops: { type: Number, default: 0 },
    geminiCalls: { type: Number, default: 0 },
    recordedSteps: { type: [testStepSchema], default: [] },
    hopLog: { type: [hopLogSchema], default: [] },
    testCaseId: String,
    error: String,
  },
  { timestamps: true }
);

export const ExploreSessionModel = mongoose.model<IExploreSessionDocument>(
  'ExploreSession',
  exploreSessionSchema
);
