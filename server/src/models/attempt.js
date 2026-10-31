import mongoose from 'mongoose';
import { sharedOptions } from './shared.js';

const answerSchema = new mongoose.Schema({
  itemId: String, selectedOptionIds: [String], numericValue: Number,
  markedForReview: Boolean, clientSeq: Number, updatedAt: Date,
}, { _id: false });
const schema = new mongoose.Schema({
  examId: { type: mongoose.Schema.Types.ObjectId, required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, required: true },
  attemptNo: { type: Number, default: 1 },
  status: { type: String, enum: ['in_progress', 'submitted', 'auto_submitted'], default: 'in_progress' },
  startedAt: Date, expiresAt: Date, submittedAt: Date,
  questionSet: mongoose.Schema.Types.Mixed,
  examSnapshot: mongoose.Schema.Types.Mixed,
  answers: { type: [answerSchema], default: [] },
  violations: { type: [mongoose.Schema.Types.Mixed], default: [] },
  violationCount: { type: Number, default: 0 },
  gradedPayload: mongoose.Schema.Types.Mixed,
  finalizedBy: String,
  timeTakenSeconds: Number,
}, sharedOptions);
schema.index({ examId: 1, studentId: 1, attemptNo: 1 }, { unique: true }); // concurrent attempt allocation.
schema.index({ status: 1, expiresAt: 1 }); // expiry sweep.
schema.index({ examId: 1, status: 1 }); // teacher monitor.
schema.index({ studentId: 1, createdAt: 1 }); // student history.
export const AttemptModel = mongoose.models.ExamGuardAttempt || mongoose.model('ExamGuardAttempt', schema);
