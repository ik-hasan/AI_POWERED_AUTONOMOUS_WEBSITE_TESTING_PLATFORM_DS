import mongoose, { Schema, Document } from 'mongoose';
import { TestStep, TestCaseOrigin } from '@platform/shared';

export interface ITestCaseDocument extends Document {
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

const testCaseSchema = new Schema<ITestCaseDocument>(
  {
    projectId: { type: String, required: true, index: true },
    websiteId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, default: '' },
    naturalLanguagePrompt: String,
    steps: [testStepSchema],
    createdBy: { type: String, required: true },
    status: { type: String, enum: ['draft', 'ready', 'archived'], default: 'draft' },
    generatedBy: { type: String, enum: ['prompt', 'explore', 'manual'] },
    exploreMeta: {
      exploreId: String,
      hops: Number,
      geminiCalls: Number,
    },
  },
  { timestamps: true }
);

testCaseSchema.index({ title: 'text', description: 'text' });

export const TestCaseModel = mongoose.model<ITestCaseDocument>('TestCase', testCaseSchema);
