import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Redis from 'ioredis';
import { Logger, validateServiceEnv } from '@platform/shared';
import { UserModel } from './models/user.model';
import { UserRepository } from './repositories/user.repository';
import { AuthService } from './services/auth.service';
import { createAuthRoutes } from './routes/auth.routes';
import { errorHandler } from './middleware';

dotenv.config();

const logger = new Logger('auth-service');
const PORT = parseInt(process.env.PORT || '3001', 10);

async function bootstrap() {
  validateServiceEnv({
    service: 'auth-service',
    required: ['MONGODB_URI', 'REDIS_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'],
  });

  const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/testing_platform';
  await mongoose.connect(mongoUri);
  logger.info('Connected to MongoDB');

  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  redis.on('error', (err) => logger.error('Redis error', { error: err.message }));

  const userRepo = new UserRepository(UserModel);
  const authService = new AuthService(
    userRepo,
    redis,
    process.env.JWT_SECRET || 'secret',
    process.env.JWT_REFRESH_SECRET || 'refresh-secret',
    process.env.JWT_EXPIRES_IN || '15m',
    process.env.JWT_REFRESH_EXPIRES_IN || '7d'
  );

  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'auth-service', timestamp: new Date().toISOString() });
  });

  app.use('/api/auth', createAuthRoutes(authService));
  app.use(errorHandler);

  app.listen(PORT, () => logger.info(`Auth service running on port ${PORT}`));
}

bootstrap().catch((err) => {
  logger.error('Failed to start', { error: err.message });
  process.exit(1);
});
