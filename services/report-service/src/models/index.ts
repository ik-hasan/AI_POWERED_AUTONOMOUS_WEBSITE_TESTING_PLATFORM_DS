import mongoose, { Schema, Document } from 'mongoose';
import { StepLog, ExecutionStatus } from '@platform/shared';

export interface IProjectDocument extends Document {
  name: string;
  description: string;
  ownerId: string;
  members: string[];
  createdAt: Date;
  updatedAt: Date;
}

export interface IWebsiteDocument extends Document {
  projectId: string;
  name: string;
  url: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface IReportDocument extends Document {
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

export interface IScreenshotDocument extends Document {
  executionId: string;
  stepOrder: number;
  filename: string;
  path: string;
  createdAt: Date;
}

const projectSchema = new Schema<IProjectDocument>(
  { name: { type: String, required: true }, description: { type: String, default: '' }, ownerId: { type: String, required: true, index: true }, members: [{ type: String }] },
  { timestamps: true }
);

const websiteSchema = new Schema<IWebsiteDocument>(
  { projectId: { type: String, required: true, index: true }, name: { type: String, required: true }, url: { type: String, required: true }, description: String },
  { timestamps: true }
);

const reportSchema = new Schema<IReportDocument>(
  {
    executionId: { type: String, required: true, unique: true, index: true },
    testCaseId: { type: String, required: true, index: true },
    projectId: { type: String, required: true, index: true },
    title: { type: String, required: true },
    status: { type: String, required: true },
    stepLogs: [Schema.Types.Mixed],
    errorMessage: String,
    screenshots: [String],
    metrics: {
      totalSteps: Number,
      passedSteps: Number,
      failedSteps: Number,
      duration: Number,
    },
  },
  { timestamps: true }
);

reportSchema.index({ title: 'text' });

const screenshotSchema = new Schema<IScreenshotDocument>(
  { executionId: { type: String, required: true, index: true }, stepOrder: Number, filename: { type: String, required: true }, path: { type: String, required: true } },
  { timestamps: true }
);

export const ProjectModel = mongoose.model<IProjectDocument>('Project', projectSchema);
export const WebsiteModel = mongoose.model<IWebsiteDocument>('Website', websiteSchema);
export const ReportModel = mongoose.model<IReportDocument>('Report', reportSchema);
export const ScreenshotModel = mongoose.model<IScreenshotDocument>('Screenshot', screenshotSchema);
