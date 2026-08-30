import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { JwtPayload } from '@platform/shared';

const PUBLIC_PATHS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/screenshots',
  '/health',
  '/api/docs',
];

export const authMiddleware =
  (jwtSecret: string) => (req: Request, res: Response, next: NextFunction) => {
    const path = req.originalUrl.split('?')[0];
    if (PUBLIC_PATHS.some((p) => path.startsWith(p))) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'No token provided' });
    }

    try {
      const token = authHeader.slice(7);
      const payload = jwt.verify(token, jwtSecret) as JwtPayload;
      req.headers['x-user-id'] = payload.userId;
      req.headers['x-user-email'] = payload.email;
      req.headers['x-user-role'] = payload.role;
      next();
    } catch {
      return res.status(401).json({ success: false, error: 'Invalid or expired token' });
    }
  };

export const roleMiddleware =
  (...roles: string[]) =>
  (req: Request, res: Response, next: NextFunction) => {
    const role = req.headers['x-user-role'] as string;
    if (!roles.includes(role)) {
      return res.status(403).json({ success: false, error: 'Insufficient permissions' });
    }
    next();
  };

export const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ success: false, error: 'Gateway error' });
};
