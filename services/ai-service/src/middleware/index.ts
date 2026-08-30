import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export class AppError extends Error {
  constructor(public statusCode: number, message: string) {
    super(message);
  }
}

export const validate = (schema: ZodSchema) => (req: Request, _res: Response, next: NextFunction) => {
  const result = schema.safeParse({ ...req.body, ...req.query, ...req.params });
  if (!result.success) {
    return next(new AppError(400, result.error.errors.map((e) => e.message).join(', ')));
  }
  next();
};

export const asyncHandler =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => {
    fn(req, res).catch(next);
  };

export const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  const status = err instanceof AppError ? err.statusCode : 500;
  res.status(status).json({ success: false, error: err.message });
};
