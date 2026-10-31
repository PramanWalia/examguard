import mongoose from 'mongoose';
import { sharedOptions } from './shared.js';

const optionSchema = new mongoose.Schema({ id: String, text: String }, { _id: false });
const schema = new mongoose.Schema({
  subject: { type: String, required: true, trim: true },
  topic: { type: String, required: true, trim: true },
  difficulty: { type: String, enum: ['easy', 'medium', 'hard'], required: true },
  type: { type: String, enum: ['single_choice', 'multiple_choice', 'numeric'], required: true },
  prompt: { type: String, required: true, trim: true },
  options: { type: [optionSchema], default: [] },
  correctOptionIds: { type: [String], default: [] },
  numericAnswer: { type: Number, default: null },
  explanation: { type: String, default: '' },
  defaultMarks: { type: Number, required: true },
  negativeMarks: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  isArchived: { type: Boolean, default: false },
}, sharedOptions);

schema.index({ createdBy: 1, subject: 1, topic: 1, difficulty: 1 });
schema.index({ subject: 'text', topic: 'text', prompt: 'text' });
schema.pre('validate', function validateQuestion(next) {
  const invalidChoice = this.type !== 'numeric' && (this.options.length < 2 || !this.correctOptionIds.length);
  const invalidNumeric = this.type === 'numeric' && (this.options.length > 0 || !Number.isFinite(this.numericAnswer));
  if (invalidChoice || invalidNumeric) return next(new Error('Invalid question shape.'));
  if (this.type === 'single_choice' && this.correctOptionIds.length !== 1) {
    return next(new Error('Single choice needs one answer.'));
  }
  return next();
});
export const QuestionModel =
  mongoose.models.ExamGuardQuestion || mongoose.model('ExamGuardQuestion', schema);
