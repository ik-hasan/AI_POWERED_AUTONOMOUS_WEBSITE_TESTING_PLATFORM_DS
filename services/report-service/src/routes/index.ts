import { Router, Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import { projectSchema, websiteSchema, paginationSchema } from '@platform/shared';
import { ProjectService, WebsiteService, ReportService } from '../services';

class AppError extends Error {
  constructor(public statusCode: number, message: string) { super(message); }
}

const asyncHandler = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => fn(req, res).catch(next);

export const createProjectRoutes = (projectService: ProjectService): Router => {
  const router = Router();

  router.get('/', asyncHandler(async (req, res) => {
    const { page, limit } = paginationSchema.parse(req.query);
    const userId = req.headers['x-user-id'] as string;
    const result = await projectService.list(userId, page, limit);
    res.json({ success: true, data: result });
  }));

  router.post('/', asyncHandler(async (req, res) => {
    const parsed = projectSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, parsed.error.errors.map((e) => e.message).join(', '));
    const userId = req.headers['x-user-id'] as string;
    const project = await projectService.create({ ...parsed.data, ownerId: userId });
    res.status(201).json({ success: true, data: project });
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const project = await projectService.getById(req.params.id);
    res.json({ success: true, data: project });
  }));

  router.put('/:id', asyncHandler(async (req, res) => {
    const project = await projectService.update(req.params.id, req.body);
    res.json({ success: true, data: project });
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    await projectService.delete(req.params.id);
    res.json({ success: true, message: 'Project deleted' });
  }));

  return router;
};

export const createWebsiteRoutes = (websiteService: WebsiteService): Router => {
  const router = Router();

  router.get('/', asyncHandler(async (req, res) => {
    const projectId = req.query.projectId as string;
    if (!projectId) throw new AppError(400, 'projectId is required');
    const websites = await websiteService.listByProject(projectId);
    res.json({ success: true, data: websites });
  }));

  router.post('/', asyncHandler(async (req, res) => {
    const parsed = websiteSchema.safeParse(req.body);
    if (!parsed.success) throw new AppError(400, parsed.error.errors.map((e) => e.message).join(', '));
    const website = await websiteService.create(parsed.data);
    res.status(201).json({ success: true, data: website });
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const website = await websiteService.getById(req.params.id);
    res.json({ success: true, data: website });
  }));

  router.put('/:id', asyncHandler(async (req, res) => {
    const website = await websiteService.update(req.params.id, req.body);
    res.json({ success: true, data: website });
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    await websiteService.delete(req.params.id);
    res.json({ success: true, message: 'Website deleted' });
  }));

  return router;
};

export const createReportRoutes = (reportService: ReportService): Router => {
  const router = Router();

  router.post('/', asyncHandler(async (req, res) => {
    const report = await reportService.create(req.body);
    res.status(201).json({ success: true, data: report });
  }));

  router.get('/', asyncHandler(async (req, res) => {
    const { page, limit, search, status, projectId } = paginationSchema.parse(req.query);
    const result = await reportService.list(projectId, page, limit, search, status);
    res.json({ success: true, data: result });
  }));

  router.get('/:id', asyncHandler(async (req, res) => {
    const report = await reportService.getById(req.params.id);
    res.json({ success: true, data: report });
  }));

  router.get('/execution/:executionId', asyncHandler(async (req, res) => {
    const report = await reportService.getByExecutionId(req.params.executionId);
    res.json({ success: true, data: report });
  }));

  router.delete('/execution/:executionId', asyncHandler(async (req, res) => {
    const deleted = await reportService.deleteByExecutionId(req.params.executionId);
    res.json({ success: true, deleted });
  }));

  router.delete('/:id', asyncHandler(async (req, res) => {
    const deleted = await reportService.deleteById(req.params.id);
    if (!deleted) throw new AppError(404, 'Report not found');
    res.json({ success: true, message: 'Report deleted' });
  }));

  router.get('/:id/download', asyncHandler(async (req, res) => {
    const report = await reportService.getById(req.params.id);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="report-${req.params.id}.json"`);
    res.send(JSON.stringify(report, null, 2));
  }));

  return router;
};

export const createAnalyticsRoutes = (reportService: ReportService): Router => {
  const router = Router();
  router.get('/', asyncHandler(async (req, res) => {
    const projectId = req.query.projectId as string | undefined;
    const analytics = await reportService.getAnalytics(projectId);
    res.json({ success: true, data: analytics });
  }));
  return router;
};

export const createScreenshotRoutes = (screenshotDir: string): Router => {
  const router = Router();
  router.get('/:filename', (req, res) => {
    const filepath = path.join(screenshotDir, req.params.filename);
    if (!fs.existsSync(filepath)) {
      return res.status(404).json({ success: false, error: 'Screenshot not found' });
    }
    res.sendFile(filepath);
  });
  return router;
};

export const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof AppError ? err.statusCode : 500;
  res.status(status).json({ success: false, error: err.message });
};
