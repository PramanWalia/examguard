import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { handlers } from '../mocks/handlers';
import * as S from '../mocks/state';

/**
 * Contract-level smoke test for the stateful mock. It exercises the rules that
 * the UI depends on: snapshot answers are stripped, client sequence numbers are
 * monotonic, submission is idempotent, and released results are graded.
 */
const server = setupServer(...handlers);
const BASE = 'http://localhost/api/v1';

const request = async (path, { method = 'GET', token, body } = {}) => {
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await response.json().catch(() => null);
  return { status: response.status, json };
};

const login = async (email, password) => {
  const { status, json } = await request('/auth/login', {
    method: 'POST',
    body: { email, password },
  });
  expect(status).toBe(200);
  return json.data.accessToken;
};

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
beforeEach(() => {
  S.resetState();
  S.state.randomFailureRate = 0;
});
afterEach(() => server.resetHandlers());

describe('mock API attempt lifecycle', () => {
  it('creates, publishes, attempts, and releases a result without leaking answer keys', async () => {
    const teacher = await login('teacher1@examguard.test', 'Teacher1234');

    const question = await request('/questions', {
      method: 'POST',
      token: teacher,
      body: {
        subject: 'Computer Science',
        topic: 'Traversal',
        difficulty: 'easy',
        type: 'single_choice',
        prompt: 'Which traversal visits the root before its children?',
        options: [
          { id: 'a', text: 'Inorder' },
          { id: 'b', text: 'Preorder' },
          { id: 'c', text: 'Postorder' },
        ],
        correctOptionIds: ['b'],
        numericAnswer: null,
        explanation: 'Preorder visits the root first.',
        defaultMarks: 2,
        negativeMarks: 0.5,
      },
    });
    expect(question.status).toBe(201);

    const now = Date.now();
    const exam = await request('/exams', {
      method: 'POST',
      token: teacher,
      body: {
        title: 'Traversal smoke test',
        description: 'Created by the automated contract smoke test.',
        durationMinutes: 30,
        startAt: new Date(now - 5 * 60_000).toISOString(),
        endAt: new Date(now + 55 * 60_000).toISOString(),
        resultMode: 'immediate',
        settings: {
          shuffleQuestions: false,
          shuffleOptions: false,
          passPercentage: 40,
          violationLimit: 3,
          autoSubmitOnViolation: true,
        },
        assignment: { batchIds: ['CSE-A', 'CSE-B'], joinCodeEnabled: true },
        items: [{ questionId: question.json.data.id, marks: 2, negativeMarks: 0.5 }],
      },
    });
    expect(exam.status).toBe(201);
    const examId = exam.json.data.id;
    expect(exam.json.data.items).toHaveLength(1);

    const published = await request(`/exams/${examId}/publish`, { method: 'POST', token: teacher });
    expect(published.status).toBe(200);
    expect(published.json.data.status).toBe('published');

    const student = await login('student2@examguard.test', 'Student1234');
    const started = await request(`/exams/${examId}/start`, { method: 'POST', token: student });
    expect(started.status).toBe(201);

    const attempt = started.json.data;
    expect(attempt.status).toBe('in_progress');
    // Student-facing questions must never include keys or explanations.
    const serialized = JSON.stringify(attempt);
    expect(serialized).not.toContain('correctOptionIds');
    expect(serialized).not.toContain('numericAnswer');
    expect(serialized).not.toContain('explanation');
    expect(attempt.questions).toHaveLength(1);

    const itemId = attempt.questions[0].id;
    const answer = await request(`/attempts/${attempt.attemptId}/answer`, {
      method: 'PATCH',
      token: student,
      body: {
        itemId,
        selectedOptionIds: ['b'],
        numericValue: null,
        markedForReview: false,
        clientSeq: 1,
      },
    });
    expect(answer.status).toBe(200);
    expect(answer.json.data.clientSeq).toBe(1);

    const stale = await request(`/attempts/${attempt.attemptId}/answer`, {
      method: 'PATCH',
      token: student,
      body: {
        itemId,
        selectedOptionIds: ['a'],
        numericValue: null,
        markedForReview: false,
        clientSeq: 1,
      },
    });
    expect(stale.status).toBe(409);
    expect(stale.json.error.code).toBe('STALE_CLIENT_SEQ');

    const submit = await request(`/attempts/${attempt.attemptId}/submit`, {
      method: 'POST',
      token: student,
    });
    expect(submit.status).toBe(200);
    expect(submit.json.data.resultAvailable).toBe(true);

    const resubmit = await request(`/attempts/${attempt.attemptId}/submit`, {
      method: 'POST',
      token: student,
    });
    expect(resubmit.status).toBe(200);
    expect(resubmit.json.data.submittedAt).toBe(submit.json.data.submittedAt);

    const result = await request(`/attempts/${attempt.attemptId}/result`, { token: student });
    expect(result.status).toBe(200);
    expect(result.json.data.score).toBe(2);
    expect(result.json.data.maxScore).toBe(2);
    expect(result.json.data.passed).toBe(true);
    expect(result.json.data.items[0].isCorrect).toBe(true);
    expect(result.json.data.items[0].explanation).toBe('Preorder visits the root first.');
  });

  it('does not give one student access to another student attempt', async () => {
    const student2 = await login('student2@examguard.test', 'Student1234');
    const student1 = await login('student1@examguard.test', 'Student1234');

    const attempt = S.state.attempts.find((entry) => entry.studentId === S.state.users.find((user) => user.email === 'student3@examguard.test')?.id);
    expect(attempt).toBeTruthy();

    const response = await request(`/attempts/${attempt.id}`, { token: student1 });
    expect(response.status).toBe(403);
    expect(response.json.error.code).toBe('FORBIDDEN');

    const own = await request('/auth/me', { token: student2 });
    expect(own.status).toBe(200);
    expect(own.json.data.email).toBe('student2@examguard.test');
  });
});
