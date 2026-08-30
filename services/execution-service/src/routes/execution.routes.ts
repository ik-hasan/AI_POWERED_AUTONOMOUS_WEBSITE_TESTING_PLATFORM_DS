import { Router, Request, Response, NextFunction } from 'express';
import { ExecutionService } from '../services/execution.service';
import { SiteExploreService } from '../services/siteExplore.service';
import { executeTestSchema, paginationSchema, ExploreJob } from '@platform/shared';

class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

const asyncHandler = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

export const createExecutionRoutes = (
  executionService: ExecutionService,
  exploreService: SiteExploreService
): Router => {
  const router = Router();

  router.post(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = executeTestSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(400, parsed.error.errors.map((e) => e.message).join(', '));
      const userId = req.headers['x-user-id'] as string;
      const execution = await executionService.queueExecution(
        parsed.data.testCaseId,
        userId,
        parsed.data.parallelWorkers,
        parsed.data.maxRetries,
        parsed.data.headless
      );
      res.status(202).json({ success: true, data: execution });
    })
  );

  router.post(
    '/explore',
    asyncHandler(async (req: Request, res: Response) => {
      const job = req.body as ExploreJob;
      if (!job?.exploreId || !job.websiteUrl || !job.prompt) {
        throw new AppError(400, 'exploreId, websiteUrl and prompt are required');
      }
      await exploreService.queue(job);
      res.status(202).json({ success: true, data: { exploreId: job.exploreId } });
    })
  );

  router.post(
    '/explore/:id/abort',
    asyncHandler(async (req: Request, res: Response) => {
      exploreService.abort(req.params.id);
      res.json({ success: true, message: 'Explore abort requested' });
    })
  );

  router.get(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      const { page, limit } = paginationSchema.parse(req.query);
      const projectId = req.query.projectId as string;
      const result = await executionService.listExecutions(projectId, page, limit);
      res.json({ success: true, data: result });
    })
  );

  router.get(
    '/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const execution = await executionService.getExecution(req.params.id);
      res.json({ success: true, data: execution });
    })
  );

  router.post(
    '/:id/abort',
    asyncHandler(async (req: Request, res: Response) => {
      await executionService.abortExecution(req.params.id);
      res.json({ success: true, message: 'Execution aborted and removed' });
    })
  );

  router.post(
    '/:id/retry',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = req.headers['x-user-id'] as string;
      const execution = await executionService.retryExecution(req.params.id, userId);
      res.status(202).json({ success: true, data: execution });
    })
  );

  return router;
};

export const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof AppError ? err.statusCode : 500;
  res.status(status).json({ success: false, error: err.message });
};



