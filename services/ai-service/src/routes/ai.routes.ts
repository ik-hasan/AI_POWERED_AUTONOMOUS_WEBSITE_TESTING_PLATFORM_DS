import { Router, Request, Response } from 'express';
import {
  generateTestSchema,
  exploreTestSchema,
  exploreNextBatchSchema,
  exploreCompleteSchema,
  testCaseSchema,
  paginationSchema,
  ExploreProgress,
} from '@platform/shared';
import { TestCaseService } from '../services/testCase.service';
import { ExploreService } from '../services/explore.service';
import { GeminiNotConfiguredError, GeminiGenerationError } from '../services/gemini.service';
import { asyncHandler, AppError } from '../middleware';

export const createAiRoutes = (testCaseService: TestCaseService, exploreService: ExploreService): Router => {
  const router = Router();

  router.post(
    '/generate',
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = generateTestSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(400, parsed.error.errors.map((e) => e.message).join(', '));

      const userId = req.headers['x-user-id'] as string;
      const { projectId, websiteId, websiteUrl, prompt, title } = parsed.data;
      try {
        const result = await testCaseService.generateFromPrompt(projectId, websiteId, websiteUrl, prompt, title, userId);
        res.status(201).json({ success: true, data: result });
      } catch (err) {
        if (err instanceof GeminiNotConfiguredError) throw new AppError(503, err.message);
        if (err instanceof GeminiGenerationError) throw new AppError(502, err.message);
        throw err;
      }
    })
  );

  router.post(
    '/explore',
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = exploreTestSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(400, parsed.error.errors.map((e) => e.message).join(', '));
      const userId = req.headers['x-user-id'] as string;
      try {
        const session = await exploreService.start({
          ...parsed.data,
          userId,
          headless: parsed.data.headless ?? true,
        });
        res.status(202).json({ success: true, data: session });
      } catch (err) {
        if (err instanceof GeminiNotConfiguredError) throw new AppError(503, err.message);
        if (err instanceof GeminiGenerationError) throw new AppError(502, err.message);
        throw new AppError(502, (err as Error).message);
      }
    })
  );

  router.get(
    '/explore/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const session = await exploreService.getById(req.params.id);
      res.json({ success: true, data: session });
    })
  );

  router.post(
    '/explore/:id/abort',
    asyncHandler(async (req: Request, res: Response) => {
      const session = await exploreService.abort(req.params.id);
      res.json({ success: true, data: session });
    })
  );

  router.post(
    '/explore/:id/progress',
    asyncHandler(async (req: Request, res: Response) => {
      const session = await exploreService.applyProgress(req.params.id, req.body as ExploreProgress);
      res.json({ success: true, data: session });
    })
  );

  router.post(
    '/explore/:id/complete',
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = exploreCompleteSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(400, parsed.error.errors.map((e) => e.message).join(', '));
      const session = await exploreService.complete(req.params.id, parsed.data);
      res.json({ success: true, data: session });
    })
  );

  router.post(
    '/next-batch',
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = exploreNextBatchSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(400, parsed.error.errors.map((e) => e.message).join(', '));
      try {
        const result = await exploreService.nextBatch(parsed.data);
        res.json({ success: true, data: result });
      } catch (err) {
        if (err instanceof GeminiNotConfiguredError) throw new AppError(503, err.message);
        if (err instanceof GeminiGenerationError) throw new AppError(502, err.message);
        throw err;
      }
    })
  );

  return router;
};

export const createTestCaseRoutes = (testCaseService: TestCaseService): Router => {
  const router = Router();

  router.get(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      const { page, limit, search } = paginationSchema.parse(req.query);
      const projectId = req.query.projectId as string;
      if (!projectId) throw new AppError(400, 'projectId is required');
      const result = await testCaseService.listByProject(projectId, page, limit, search);
      res.json({ success: true, data: result });
    })
  );

  router.get(
    '/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const testCase = await testCaseService.getById(req.params.id);
      res.json({ success: true, data: testCase });
    })
  );

  router.post(
    '/',
    asyncHandler(async (req: Request, res: Response) => {
      const parsed = testCaseSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError(400, parsed.error.errors.map((e) => e.message).join(', '));
      const userId = req.headers['x-user-id'] as string;
      const result = await testCaseService.createManual({ ...parsed.data, createdBy: userId });
      res.status(201).json({ success: true, data: result });
    })
  );

  router.put(
    '/:id',
    asyncHandler(async (req: Request, res: Response) => {
      const testCase = await testCaseService.update(req.params.id, req.body);
      res.json({ success: true, data: testCase });
    })
  );

  router.delete(
    '/:id',
    asyncHandler(async (req: Request, res: Response) => {
      await testCaseService.delete(req.params.id);
      res.json({ success: true, message: 'Test case deleted' });
    })
  );

  return router;
};
