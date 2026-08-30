import { IUserDocument } from '../models/user.model';

export interface IUserRepository {
  findByEmail(email: string): Promise<IUserDocument | null>;
  findById(id: string): Promise<IUserDocument | null>;
  create(data: Partial<IUserDocument>): Promise<IUserDocument>;
  updateRefreshToken(id: string, refreshToken: string | null): Promise<void>;
  count(): Promise<number>;
}

export class UserRepository implements IUserRepository {
  constructor(private readonly model: typeof import('../models/user.model').UserModel) {}

  async findByEmail(email: string): Promise<IUserDocument | null> {
    return this.model.findOne({ email: email.toLowerCase() });
  }

  async findById(id: string): Promise<IUserDocument | null> {
    return this.model.findById(id);
  }

  async create(data: Partial<IUserDocument>): Promise<IUserDocument> {
    return this.model.create(data);
  }

  async updateRefreshToken(id: string, refreshToken: string | null): Promise<void> {
    await this.model.findByIdAndUpdate(id, { refreshToken });
  }

  async count(): Promise<number> {
    return this.model.countDocuments();
  }
}
