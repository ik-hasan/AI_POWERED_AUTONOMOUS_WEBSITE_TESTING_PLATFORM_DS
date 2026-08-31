import { Router, Request, Response } from 'express';
import { registerSchema, loginSchema, refreshTokenSchema } from '@platform/shared';
import { AuthService } from '../services/auth.service';
import { validate, asyncHandler, AppError } from '../middleware';

export const createAuthRoutes = (authService: AuthService): Router => {
  const router = Router();

  router.post(
    '/register',
    validate(registerSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const { email, password, name } = req.body;
      const result = await authService.register(email, password, name);
      res.status(201).json({ success: true, data: result });
    })
  );

  router.post(
    '/login',
    validate(loginSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const { email, password } = req.body;
      const result = await authService.login(email, password);
      res.json({ success: true, data: result });
    })
  );

  router.post(
    '/refresh',
    validate(refreshTokenSchema),
    asyncHandler(async (req: Request, res: Response) => {
      const { refreshToken } = req.body;
      const tokens = await authService.refresh(refreshToken);
      res.json({ success: true, data: tokens });
    })
  );

  router.post(
    '/logout',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) throw new AppError(401, 'Unauthorized');
      await authService.logout(userId);
      res.json({ success: true, message: 'Logged out' });
    })
  );

  router.get(
    '/me',
    asyncHandler(async (req: Request, res: Response) => {
      const userId = req.headers['x-user-id'] as string;
      if (!userId) throw new AppError(401, 'Unauthorized');
      const user = await authService.getUserById(userId);
      if (!user) throw new AppError(404, 'User not found');
      res.json({ success: true, data: user });
    })
  );

  router.post(
    '/verify',
    asyncHandler(async (req: Request, res: Response) => {
      const token = req.headers.authorization?.replace('Bearer ', '');
      if (!token) throw new AppError(401, 'No token provided');
      const payload = await authService.verifyToken(token);
      res.json({ success: true, data: payload });
    })
  );

  return router;
};
