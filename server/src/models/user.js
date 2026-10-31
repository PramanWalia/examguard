import mongoose from 'mongoose';
import { sharedOptions } from './shared.js';

const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ['admin', 'teacher', 'student'], default: 'student' },
  batchIds: { type: [String], default: [] },
  isActive: { type: Boolean, default: true },
  tokenVersion: { type: Number, default: 0 },
  joinedExamIds: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  lastLoginAt: Date,
}, sharedOptions);

schema.index({ role: 1, batchIds: 1 }); // batch-filtered admin user lists and student eligibility.
export const UserModel = mongoose.models.ExamGuardUser || mongoose.model('ExamGuardUser', schema);
