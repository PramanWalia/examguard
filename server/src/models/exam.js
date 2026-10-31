import mongoose from 'mongoose';
import { sharedOptions } from './shared.js';

const itemSchema = new mongoose.Schema({
  id: { type: String, required: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  order: Number,
  marks: Number,
  negativeMarks: Number,
  questionSnapshot: mongoose.Schema.Types.Mixed,
}, { _id: false });
const schema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  durationMinutes: Number,
  startAt: Date,
  endAt: Date,
  status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
  resultMode: { type: String, enum: ['immediate', 'after_end', 'manual'], default: 'after_end' },
  settings: { type: mongoose.Schema.Types.Mixed, default: {} },
  assignment: { batchIds: { type: [String], default: [] }, joinCodeEnabled: { type: Boolean, default: true } },
  joinCode: { type: String, unique: true, sparse: true },
  items: { type: [itemSchema], default: [] },
  totalMarks: { type: Number, default: 0 },
  createdBy: { type: mongoose.Schema.Types.ObjectId, required: true },
  publishedAt: Date,
  resultsReleasedAt: Date,
}, sharedOptions);
schema.index({ createdBy: 1, status: 1 }); // teacher exam lists.
schema.index({ status: 1, startAt: 1, endAt: 1 }); // availability and phase queries.
schema.index({ 'assignment.batchIds': 1 }); // assigned student exam lists.
schema.virtual('phase').get(function phase() {
  const now = Date.now();
  if (this.status !== 'published' || now < this.startAt?.getTime()) return 'upcoming';
  return now <= this.endAt?.getTime() ? 'live' : 'ended';
});
export const ExamModel = mongoose.models.ExamGuardExam || mongoose.model('ExamGuardExam', schema);
