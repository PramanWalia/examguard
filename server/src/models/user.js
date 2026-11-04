import mongoose from 'mongoose';

import { sharedOptions } from './shared.js';

const sessionSchema = new mongoose.Schema(
  {
    sid: { type: String, required: true },
    jti: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
  },
  { _id: false },
);

const schema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ['admin', 'teacher', 'student'], default: 'student' },
    batchIds: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
    approvalStatus: {
      type: String,
      enum: ['approved', 'pending'],
      default: 'approved',
    },
    tokenVersion: { type: Number, default: 0 },
    sessions: { type: [sessionSchema], default: [] },
    joinedExamIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    lastLoginAt: { type: Date, default: null },
  },
  sharedOptions,
);

schema.index({ role: 1, batchIds: 1 });

export const UserModel =
  mongoose.models.ExamGuardUser || mongoose.model('ExamGuardUser', schema);
