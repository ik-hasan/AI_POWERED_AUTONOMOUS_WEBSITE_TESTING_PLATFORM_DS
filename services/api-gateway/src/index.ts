import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import rateLimit from 'express-rate-limit';
import Redis from 'ioredis';
import { createProxyMiddleware, Options } from 'http-proxy-middleware';
import { Logger } from '@platform/shared';
import { authMiddleware, errorHandler } from './middleware/auth.middleware';

dotenv.config();

const logger = new Logger('api-gateway');
const PORT = parseInt(process.env.PORT || '3000', 10);
const JWT_SECRET = process.env.JWT_SECRET || 'secret';

function createServiceProxy(target: string, apiPrefix: string): Options {
  return {
    target,
    changeOrigin: true,
    pathRewrite: (path) => `${apiPrefix}${path}`,
    on: {
      proxyReq: (proxyReq, req) => {
        proxyReq.setHeader('x-user-id', (req.headers['x-user-id'] as string) || '');
        proxyReq.setHeader('x-user-email', (req.headers['x-user-email'] as string) || '');

        const body = (req as express.Request).body;
        if (body && Object.keys(body).length > 0) {
          const bodyData = JSON.stringify(body);
          proxyReq.setHeader('Content-Type', 'application/json');
          proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
        }
      },
      error: (err, _req, res) => {
        logger.error('Proxy error', { error: err.message });
        if ('writeHead' in res) {
          (res as express.Response).status(502).json({ success: false, error: 'Service unavailable' });
        }
      },
    },
  };
}

async function bootstrap() {
  const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  redis.on('error', (err) => logger.warn('Redis error', { error: err.message }));

  const app = express();
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: process.env.CORS_ORIGIN || '*', credentials: true }));
  app.use(express.json({ limit: '10mb' }));

  if (process.env.SKIP_REDIS_RATE_LIMIT === 'true' || process.env.NODE_ENV === 'development') {
    app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false }));
  } else {
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000,
      max: 200,
      standardHeaders: true,
      legacyHeaders: false,
      store: {
        init: () => {},
        increment: async (key: string) => {
          const count = await redis.incr(`rate:${key}`);
          if (count === 1) await redis.expire(`rate:${key}`, 900);
          return { totalHits: count, resetTime: new Date(Date.now() + 900000) };
        },
        decrement: async (key: string) => { await redis.decr(`rate:${key}`); },
        resetKey: async (key: string) => { await redis.del(`rate:${key}`); },
      },
    });
    app.use(limiter);
  }

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'api-gateway', timestamp: new Date().toISOString() });
  });

  app.use(authMiddleware(JWT_SECRET));

  const services = {
    auth: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
    ai: process.env.AI_SERVICE_URL || 'http://localhost:3002',
    execution: process.env.EXECUTION_SERVICE_URL || 'http://localhost:3003',
    report: process.env.REPORT_SERVICE_URL || 'http://localhost:3004',
    notification: process.env.NOTIFICATION_SERVICE_URL || 'http://localhost:3005',
  };

  app.use('/api/auth', createProxyMiddleware(createServiceProxy(services.auth, '/api/auth')));
  app.use('/api/projects', createProxyMiddleware(createServiceProxy(services.report, '/api/projects')));
  app.use('/api/websites', createProxyMiddleware(createServiceProxy(services.report, '/api/websites')));
  app.use('/api/test-cases', createProxyMiddleware(createServiceProxy(services.ai, '/api/test-cases')));
  app.use('/api/ai', createProxyMiddleware(createServiceProxy(services.ai, '/api/ai')));
  app.use('/api/executions', createProxyMiddleware(createServiceProxy(services.execution, '/api/executions')));
  app.use('/api/reports', createProxyMiddleware(createServiceProxy(services.report, '/api/reports')));
  app.use('/api/analytics', createProxyMiddleware(createServiceProxy(services.report, '/api/analytics')));
  app.use('/api/screenshots', createProxyMiddleware(createServiceProxy(services.report, '/api/screenshots')));

  app.use(errorHandler);

  app.listen(PORT, () => logger.info(`API Gateway running on port ${PORT}`));
}

bootstrap().catch((err) => {
  logger.error('Failed to start', { error: err.message });
  process.exit(1);
});
