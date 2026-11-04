import mongoose from 'mongoose';

import { sharedOptions } from './shared.js';

const optionSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    text: { type: String, required: true },
  },
  { _id: false },
);

const questionSnapshotSchema = new mongoose.Schema(
  {
    subject: { type: String, default: '' },
    topic: { type: String, default: '' },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    type: { type: String, enum: ['single_choice', 'multiple_choice', 'numeric'], required: true },
    prompt: { type: String, required: true },
    options: { type: [optionSchema], default: [] },
    correctOptionIds: { type: [String], default: [] },
    numericAnswer: { type: Number, default: null },
    explanation: { type: String, default: '' },
  },
  { _id: false },
);

const questionSetItemSchema = new mongoose.Schema(
  {
    id: { type: String, required: true },
    questionId: { type: String, default: null },
    order: { type: Number, required: true },
    marks: { type: Number, required: true },
    negativeMarks: { type: Number, default: 0 },
    question: { type: questionSnapshotSchema, required: true },
  },
  { _id: false },
);

const examSnapshotSchema = new mongoose.Schema(
  {
    id: { type: String, default: null },
    title: { type: String, default: '' },
    durationMinutes: { type: Number, default: 0 },
    endAt: { type: Date, default: null },
    resultMode: { type: String, enum: ['immediate', 'after_end', 'manual'], default: 'after_end' },
  },
  { _id: false },
);

const answerSchema = new mongoose.Schema(
  {
    itemId: { type: String, required: true },
    selectedOptionIds: { type: [String], default: [] },
    numericValue: { type: Number, default: null },
    markedForReview: { type: Boolean, default: false },
    clientSeq: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const violationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        'tab_hidden',
        'window_blur',
        'fullscreen_exit',
        'copy',
        'paste',
        'context_menu',
        'shortcut',
        'heartbeat_missed',
        'long_answer_gap',
        'ip_change',
        'user_agent_change',
        'other',
      ],
      required: true,
    },
    source: {
      type: String,
      enum: ['client', 'server'],
      default: 'client',
    },
    meta: {
      type: Map,
      of: mongoose.Schema.Types.Mixed,
      default: {},
    },
    occurredAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
  },
  { _id: false },
);

const clientSessionSchema = new mongoose.Schema(
  {
    ip: { type: String, default: null },
    userAgent: { type: String, default: null },
    lastHeartbeatAt: { type: Date, default: null },
    lastAnswerAt: { type: Date, default: null },
  },
  { _id: false },
);

const schema = new mongoose.Schema(
  {
    examId: { type: mongoose.Schema.Types.ObjectId, required: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, required: true },
    attemptNo: { type: Number, default: 1 },
    status: {
      type: String,
      enum: ['in_progress', 'submitted'],
      default: 'in_progress',
    },
    startedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true },
    submittedAt: { type: Date, default: null },
    questionSet: { type: [questionSetItemSchema], default: [] },
    examSnapshot: { type: examSnapshotSchema, default: () => ({}) },
    answers: { type: [answerSchema], default: [] },
    violations: { type: [violationSchema], default: [] },
    violationCount: { type: Number, default: 0 },
    clientSession: { type: clientSessionSchema, default: () => ({}) },
    gradedPayload: { type: mongoose.Schema.Types.Mixed, default: null },
    finalizedBy: {
      type: String,
      enum: ['submit', 'expiry', 'violation', null],
      default: null,
    },
    timeTakenSeconds: { type: Number, default: null },
  },
  sharedOptions,
);

schema.index({ examId: 1, studentId: 1, attemptNo: 1 }, { unique: true });
schema.index({ status: 1, expiresAt: 1 });
schema.index({ examId: 1, status: 1, expiresAt: 1 });
schema.index({ studentId: 1, createdAt: 1 });

export const AttemptModel =
  mongoose.models.ExamGuardAttempt || mongoose.model('ExamGuardAttempt', schema);
