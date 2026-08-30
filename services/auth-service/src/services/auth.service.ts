import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import Redis from 'ioredis';
import { JwtPayload, UserRole, Logger } from '@platform/shared';
import { IUserRepository } from '../repositories/user.repository';
import { IUserDocument } from '../models/user.model';

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: { id: string; email: string; name: string; role: UserRole };
  tokens: AuthTokens;
}

export class AuthService {
  private logger = new Logger('auth-service');

  constructor(
    private readonly userRepo: IUserRepository,
    private readonly redis: Redis,
    private readonly jwtSecret: string,
    private readonly jwtRefreshSecret: string,
    private readonly jwtExpiresIn: string,
    private readonly jwtRefreshExpiresIn: string
  ) {}

  async register(email: string, password: string, name: string): Promise<AuthResult> {
    const existing = await this.userRepo.findByEmail(email);
    if (existing) {
      throw new Error('Email already registered');
    }

    const isFirstUser = (await this.userRepo.count()) === 0;
    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await this.userRepo.create({
      email,
      password: hashedPassword,
      name,
      role: isFirstUser ? 'admin' : 'editor',
    });

    const tokens = await this.generateTokens(user);
    this.logger.info('User registered', { userId: user._id.toString() });
    return this.formatAuthResult(user, tokens);
  }

  async login(email: string, password: string): Promise<AuthResult> {
    const user = await this.userRepo.findByEmail(email);
    if (!user) {
      throw new Error('Invalid credentials');
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new Error('Invalid credentials');
    }

    const tokens = await this.generateTokens(user);
    this.logger.info('User logged in', { userId: user._id.toString() });
    return this.formatAuthResult(user, tokens);
  }

  async refresh(refreshToken: string): Promise<AuthTokens> {
    try {
      const payload = jwt.verify(refreshToken, this.jwtRefreshSecret) as JwtPayload;
      const sessionKey = `session:${payload.userId}`;
      const stored = await this.redis.get(sessionKey);
      if (stored !== refreshToken) {
        throw new Error('Invalid refresh token');
      }

      const user = await this.userRepo.findById(payload.userId);
      if (!user) {
        throw new Error('User not found');
      }

      return this.generateTokens(user);
    } catch {
      throw new Error('Invalid refresh token');
    }
  }

  async logout(userId: string): Promise<void> {
    await this.redis.del(`session:${userId}`);
    await this.userRepo.updateRefreshToken(userId, null);
    this.logger.info('User logged out', { userId });
  }

  async verifyToken(token: string): Promise<JwtPayload> {
    return jwt.verify(token, this.jwtSecret) as JwtPayload;
  }

  async getUserById(id: string) {
    const user = await this.userRepo.findById(id);
    if (!user) return null;
    return {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      role: user.role,
    };
  }

  private async generateTokens(user: IUserDocument): Promise<AuthTokens> {
    const payload: JwtPayload = {
      userId: user._id.toString(),
      email: user.email,
      role: user.role,
    };

    const accessToken = jwt.sign(payload, this.jwtSecret, {
      expiresIn: this.jwtExpiresIn as jwt.SignOptions['expiresIn'],
    });
    const refreshToken = jwt.sign(payload, this.jwtRefreshSecret, {
      expiresIn: this.jwtRefreshExpiresIn as jwt.SignOptions['expiresIn'],
    });

    await this.redis.setex(`session:${user._id.toString()}`, 7 * 24 * 3600, refreshToken);
    await this.userRepo.updateRefreshToken(user._id.toString(), refreshToken);

    return { accessToken, refreshToken };
  }

  private formatAuthResult(user: IUserDocument, tokens: AuthTokens): AuthResult {
    return {
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        role: user.role,
      },
      tokens,
    };
  }
}
