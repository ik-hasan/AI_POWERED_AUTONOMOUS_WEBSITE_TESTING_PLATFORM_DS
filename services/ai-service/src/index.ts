import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Redis from 'ioredis';
import { Logger, validateServiceEnv } from '@platform/shared';
import { TestCaseModel } from './models/testCase.model';
import { TestCaseRepository } from './repositories/testCase.repository';
import { GeminiService, TestPlanCache } from './services/gemini.service';
import { TestCaseService } from './services/testCase.service';
import { ExploreService } from './services/explore.service';
import { createAiRoutes, createTestCaseRoutes } from './routes/ai.routes';
import { errorHandler } from './middleware';

dotenv.config();

const logger = new Logger('ai-service');
const PORT = parseInt(process.env.PORT || '3002', 10);

async function bootstrap() {
  validateServiceEnv({
    service: 'ai-service',
    required: ['MONGODB_URI', 'REDIS_URL'],
    productionOnly: ['GEMINI_API_KEY'],
  });

  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/testing_platform');
  logger.info('Connected to MongoDB');

  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  const repo = new TestCaseRepository(TestCaseModel);
  const gemini = new GeminiService(process.env.GEMINI_API_KEY || '');
  if (gemini.isConfigured()) {
    logger.info('Gemini AI configured — production-grade test generation enabled');
  } else {
    logger.warn('GEMINI_API_KEY not set — AI generation disabled until key is configured');
  }
  const cache = new TestPlanCache(redis);
  const testCaseService = new TestCaseService(repo, gemini, cache);
  const exploreService = new ExploreService(
    gemini,
    testCaseService,
    process.env.EXECUTION_SERVICE_URL || 'http://localhost:3003'
  );

  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  app.get('/health', (_req, res) => {
    res.json({
      status: 'ok',
      service: 'ai-service',
      geminiConfigured: gemini.isConfigured(),
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/ai', createAiRoutes(testCaseService, exploreService));
  app.use('/api/test-cases', createTestCaseRoutes(testCaseService));
  app.use(errorHandler);

  app.listen(PORT, () => logger.info(`AI service running on port ${PORT}`));
}

bootstrap().catch((err) => {
  logger.error('Failed to start', { error: err.message });
  process.exit(1);
});
