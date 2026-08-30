import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Redis from 'ioredis';
import { Logger } from '@platform/shared';
import { ProjectService, WebsiteService, ReportService } from './services';
import {
  createProjectRoutes,
  createWebsiteRoutes,
  createReportRoutes,
  createAnalyticsRoutes,
  createScreenshotRoutes,
  errorHandler,
} from './routes';

dotenv.config();

const logger = new Logger('report-service');
const PORT = parseInt(process.env.PORT || '3004', 10);
const SCREENSHOT_DIR = process.env.SCREENSHOT_DIR || './screenshots';

async function bootstrap() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/testing_platform');
  logger.info('Connected to MongoDB');

  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  const projectService = new ProjectService();
  const websiteService = new WebsiteService();
  const reportService = new ReportService(redis);

  const app = express();
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'report-service', timestamp: new Date().toISOString() });
  });

  app.use('/api/projects', createProjectRoutes(projectService));
  app.use('/api/websites', createWebsiteRoutes(websiteService));
  app.use('/api/reports', createReportRoutes(reportService));
  app.use('/api/analytics', createAnalyticsRoutes(reportService));
  app.use('/api/screenshots', createScreenshotRoutes(SCREENSHOT_DIR));
  app.use(errorHandler);

  app.listen(PORT, () => logger.info(`Report service running on port ${PORT}`));
}

bootstrap().catch((err) => {
  logger.error('Failed to start', { error: err.message });
  process.exit(1);
});
