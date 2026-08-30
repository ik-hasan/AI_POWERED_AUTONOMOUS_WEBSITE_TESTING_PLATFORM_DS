import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { Logger } from '@platform/shared';
import { RabbitMQService } from './services/rabbitmq.service';
import { PlaywrightExecutor } from './services/playwright.service';
import { ExecutionService } from './services/execution.service';
import { SiteExploreService } from './services/siteExplore.service';
import { createExecutionRoutes, errorHandler } from './routes/execution.routes';

dotenv.config();

const logger = new Logger('execution-service');
const PORT = parseInt(process.env.PORT || '3003', 10);

async function bootstrap() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/testing_platform');
  logger.info('Connected to MongoDB');

  const devInlineMode = process.env.DEV_SKIP_RABBITMQ === 'true';
  let rabbitmq: RabbitMQService | null = null;
  if (!devInlineMode) {
    rabbitmq = new RabbitMQService(process.env.RABBITMQ_URL || 'amqp://localhost:5672');
    await rabbitmq.connect();
  } else {
    logger.info('DEV_SKIP_RABBITMQ enabled — jobs run inline');
  }

  const headless = process.env.PLAYWRIGHT_HEADLESS !== 'false';
  const slowMo = parseInt(process.env.PLAYWRIGHT_SLOW_MO || '0', 10);
  const executor = new PlaywrightExecutor(process.env.SCREENSHOT_DIR || './screenshots', {
    headless,
    slowMo,
  });
  logger.info(`Browser launch: ${headless ? 'headless' : 'headed'}`);
  const executionService = new ExecutionService(
    rabbitmq,
    executor,
    process.env.REPORT_SERVICE_URL || 'http://localhost:3004',
    process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3005',
    process.env.AI_SERVICE_URL || 'http://localhost:3002',
    devInlineMode
  );

  executionService.connectNotifications();
  const exploreService = new SiteExploreService(
    executor,
    rabbitmq,
    process.env.AI_SERVICE_URL || 'http://localhost:3002',
    () => executionService.getNotificationSocket(),
    devInlineMode
  );
  await executionService.startConsumer();
  await exploreService.startConsumer();

  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'execution-service', timestamp: new Date().toISOString() });
  });

  app.use('/api/executions', createExecutionRoutes(executionService, exploreService));
  app.use(errorHandler);

  app.listen(PORT, () => logger.info(`Execution service running on port ${PORT}`));
}

bootstrap().catch((err) => {
  logger.error('Failed to start', { error: err.message });
  process.exit(1);
});
