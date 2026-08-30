import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { Logger } from '@platform/shared';

dotenv.config();

const logger = new Logger('notification-service');
const PORT = parseInt(process.env.PORT || '3005', 10);

interface ExecutionProgress {
  executionId: string;
  status: string;
  progress: number;
  currentStep: number;
  totalSteps: number;
  error?: string;
  timestamp: string;
}

interface LogEntry {
  executionId: string;
  level: string;
  message: string;
  timestamp: string;
}

function bootstrap() {
  const app = express();
  const httpServer = createServer(app);

  const io = new Server(httpServer, {
    cors: { origin: process.env.CORS_ORIGIN || '*', methods: ['GET', 'POST'] },
    transports: ['websocket', 'polling'],
  });

  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', service: 'notification-service', timestamp: new Date().toISOString() });
  });

  io.on('connection', (socket) => {
    logger.info('Client connected', { socketId: socket.id });

    socket.on('subscribe:execution', (executionId: string) => {
      socket.join(`execution:${executionId}`);
      logger.debug('Subscribed to execution', { executionId, socketId: socket.id });
    });

    socket.on('unsubscribe:execution', (executionId: string) => {
      socket.leave(`execution:${executionId}`);
    });

    socket.on('subscribe:explore', (exploreId: string) => {
      socket.join(`explore:${exploreId}`);
      logger.debug('Subscribed to explore', { exploreId, socketId: socket.id });
    });

    socket.on('unsubscribe:explore', (exploreId: string) => {
      socket.leave(`explore:${exploreId}`);
    });

    socket.on('execution:progress', (data: ExecutionProgress) => {
      io.to(`execution:${data.executionId}`).emit('execution:update', data);

      if (data.status === 'passed' || data.status === 'failed') {
        io.emit('notification', {
          type: 'execution_complete',
          executionId: data.executionId,
          status: data.status,
          message: data.status === 'passed'
            ? 'Test execution completed successfully'
            : `Test execution failed: ${data.error || 'Unknown error'}`,
          timestamp: data.timestamp,
        });
      }
    });

    socket.on('execution:log', (data: LogEntry) => {
      io.to(`execution:${data.executionId}`).emit('execution:log', data);
    });

    socket.on('explore:progress', (data: { exploreId: string }) => {
      io.to(`explore:${data.exploreId}`).emit('explore:update', data);
    });

    socket.on('disconnect', () => {
      logger.info('Client disconnected', { socketId: socket.id });
    });
  });

  httpServer.listen(PORT, () => {
    logger.info(`Notification service running on port ${PORT}`);
  });
}

bootstrap();
