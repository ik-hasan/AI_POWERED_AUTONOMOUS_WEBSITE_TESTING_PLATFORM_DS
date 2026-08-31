import mongoose, { Schema, Document } from 'mongoose';

export interface IUserDocument extends Document {
  email: string;
  password: string;
  name: string;
  refreshToken?: string;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUserDocument>(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    name: { type: String, required: true, trim: true },
    refreshToken: { type: String },
  },
  { timestamps: true }
);

userSchema.index({ email: 1 });

export const UserModel = mongoose.model<IUserDocument>('User', userSchema);
