# ExamGuard API Contract

**Base URL:** `/api/v1`  
**Format:** JSON unless an endpoint explicitly says `multipart/form-data` or CSV.  
**Time:** ISO 8601 UTC strings. The server alone decides time, permissions, score, marks, ownership, and result visibility.

## Shared rules

### Authentication and response envelope

Send the access token with `Authorization: Bearer <accessToken>`. `POST /auth/refresh` reads the refresh token only from its `httpOnly`, `Secure`, `SameSite=Lax` cookie and rotates it. The client never stores refresh tokens or access tokens in local storage.

Successful responses use:

```json
{ "success": true, "data": {}, "meta": {} }
```

Errors use:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "One or more fields are invalid.",
    "details": [{ "path": "email", "message": "Enter a valid email address." }]
  }
}
```

All request bodies reject unknown fields. Entity IDs are MongoDB ObjectId strings (`^[a-fA-F0-9]{24}$`); batch IDs are opaque slugs such as `CSE-A`. Strings are trimmed unless stated otherwise. Pagination defaults to `page=1`, `limit=20`, with `limit` from 1-100.

### Error catalogue

Every protected endpoint can return `401 UNAUTHORIZED`; a caller with the wrong role or no ownership can receive `403 FORBIDDEN`; and unknown resources receive `404 NOT_FOUND`.

| Status | Code | Meaning |
|---|---|---|
| 400 | `VALIDATION_ERROR` | Request shape, type, or value fails validation. |
| 401 | `UNAUTHORIZED` | Missing, expired, malformed, or revoked access token. |
| 403 | `FORBIDDEN` | Authenticated user lacks the required role or ownership. |
| 403 | `EXAM_NOT_LIVE` | A student tries to join/start outside the live window or for an unpublished exam. |
| 403 | `RESULT_NOT_AVAILABLE` | Result is not released or the caller may not view it. |
| 404 | `NOT_FOUND` | Requested resource does not exist or is deliberately hidden. |
| 409 | `ALREADY_ATTEMPTED` | Student already has an attempt for this exam. |
| 409 | `ATTEMPT_EXPIRED` | Attempt is no longer in progress because `expiresAt <= serverTime`. |
| 409 | `INVALID_STATE` | Operation is not valid for the resource’s current state. |
| 409 | `DUPLICATE_EMAIL` | Registration email is already in use. |
| 413 | `FILE_TOO_LARGE` | Import file exceeds the configured size limit. |
| 415 | `UNSUPPORTED_FILE_TYPE` | Import is not a CSV or XLSX file. |
| 422 | `IMPORT_VALIDATION_FAILED` | Import file was readable but has invalid rows. |
| 429 | `RATE_LIMITED` | Endpoint rate limit is exceeded. |
| 500 | `INTERNAL_ERROR` | Unexpected server failure; no internal details are exposed. |

Rate-limited auth endpoints and any endpoint behind a global limiter may return `429 RATE_LIMITED` with `Retry-After`. Thus it is omitted from repeated endpoint tables below only where it adds no endpoint-specific meaning.

Unless an endpoint table narrows this list, the error catalogue applies to that endpoint whenever its stated condition is possible. Every endpoint may additionally return `429 RATE_LIMITED` when covered by the global rate limiter.

### Shared object shapes

#### User

```json
{
  "id": "6650c7f52c0d42bd31f4b5d9",
  "name": "Asha Kumar",
  "email": "asha@example.com",
  "role": "student",
  "batchIds": ["CSE-A"],
  "isActive": true,
  "createdAt": "2026-10-01T08:00:00.000Z",
  "updatedAt": "2026-10-01T08:00:00.000Z"
}
```

`role` is one of `admin`, `teacher`, `student`. `batchIds` is meaningful for students. **Never return:** `passwordHash`, refresh tokens, token hashes, password reset tokens, or internal audit metadata.

#### Question (teacher/admin representation)

```json
{
  "id": "6650c9002c0d42bd31f4b601",
  "subject": "Data Structures",
  "topic": "Trees",
  "difficulty": "medium",
  "type": "single_choice",
  "prompt": "Which traversal visits root before children?",
  "options": [{ "id": "a", "text": "Preorder" }, { "id": "b", "text": "Inorder" }],
  "correctOptionIds": ["a"],
  "numericAnswer": null,
  "explanation": "Preorder processes the root first.",
  "defaultMarks": 2,
  "negativeMarks": 0,
  "createdBy": "6650c7f52c0d42bd31f4b5d9",
  "createdAt": "2026-10-01T08:00:00.000Z",
  "updatedAt": "2026-10-01T08:00:00.000Z"
}
```

Types are `single_choice`, `multiple_choice`, or `numeric`. Choice questions require 2–6 options with unique local IDs. `single_choice` requires exactly one correct option; `multiple_choice` requires one or more; `numeric` has no options and requires `numericAnswer` (finite number). `defaultMarks` is 0–100; `negativeMarks` is 0–100 and cannot exceed default marks.

#### Exam and published item

```json
{
  "id": "6650ca002c0d42bd31f4b602",
  "title": "DSA Midterm",
  "description": "Trees and graphs",
  "durationMinutes": 45,
  "startAt": "2026-11-03T09:00:00.000Z",
  "endAt": "2026-11-03T11:00:00.000Z",
  "status": "published",
  "assignment": { "batchIds": ["6650c81d2c0d42bd31f4b600"], "joinCodeEnabled": true },
  "joinCode": "DSA-2048",
  "items": [{ "id": "6650cb002c0d42bd31f4b603", "questionId": "6650c9002c0d42bd31f4b601", "order": 1, "marks": 2, "negativeMarks": 0, "questionSnapshot": { "prompt": "Which traversal visits root before children?", "type": "single_choice", "options": [{ "id": "a", "text": "Preorder" }, { "id": "b", "text": "Inorder" }] } }],
  "createdBy": "6650c7f52c0d42bd31f4b5d9",
  "resultsReleasedAt": null,
  "createdAt": "2026-10-01T08:00:00.000Z",
  "updatedAt": "2026-10-01T08:00:00.000Z"
}
```

An exam is `draft` or `published`. Publishing creates immutable question snapshots. `durationMinutes` is 1–480; `startAt < endAt`; a published exam needs at least one item; an item’s `marks` is 0–100 and `negativeMarks` is 0–100, not greater than marks. Teachers receive answers inside stored snapshots only when permitted; students do not.

The shared Exam shape above is a teacher/admin representation. Student-facing exam metadata (`GET /exams/available`, `POST /exams/join`, and student `GET /exams/:id`) must never include `joinCode`, `items`, `questionSnapshot`, answer keys, explanations, scoring detail, or any other private assignment data.

#### Student-facing exam metadata

```json
{
  "id": "6650ca002c0d42bd31f4b602",
  "title": "DSA Midterm",
  "description": "Trees and graphs",
  "durationMinutes": 45,
  "startAt": "2026-11-03T09:00:00.000Z",
  "endAt": "2026-11-03T11:00:00.000Z",
  "availability": "live",
  "attemptStatus": "in_progress",
  "attemptId": "6650cc002c0d42bd31f4b604",
  "canStart": false,
  "canResume": true,
  "resultAvailable": false,
  "score": null,
  "percentage": null,
  "passed": null,
  "itemCount": 12,
  "totalMarks": 50,
  "policy": {
    "passPercentage": 40,
    "violationLimit": 3,
    "autoSubmitOnViolation": true
  }
}
```

`availability` is `upcoming`, `live`, or `ended`. `attemptStatus` is `null`, `in_progress`, or `submitted`; `attemptId` identifies the student's own attempt when one exists. `canStart` is true only while the window is live and the student has not started. `canResume` is true only for an in-progress attempt. `score`, `percentage`, and `passed` are `null` until the result is released; when `resultAvailable` is true they carry the same values as the result endpoint. `joinCode`, assignment batches, question counts per item, and scoring internals are never exposed.

#### ExamItem sent to students

```json
{
  "id": "6650cb002c0d42bd31f4b603",
  "order": 1,
  "marks": 2,
  "negativeMarks": 0,
  "question": {
    "prompt": "Which traversal visits root before children?",
    "type": "single_choice",
    "options": [{ "id": "a", "text": "Preorder" }, { "id": "b", "text": "Inorder" }]
  }
}
```

**Student-facing responses must never include:** `correctOptionIds`, `numericAnswer`, `explanation`, any answer key, a computed per-item correctness flag, or another student’s answers.

#### Attempt state and result

```json
{
  "id": "6650cc002c0d42bd31f4b604",
  "examId": "6650ca002c0d42bd31f4b602",
  "studentId": "6650c7f52c0d42bd31f4b5d9",
  "status": "in_progress",
  "startedAt": "2026-11-03T09:15:00.000Z",
  "expiresAt": "2026-11-03T10:00:00.000Z",
  "savedAnswers": [{ "itemId": "6650cb002c0d42bd31f4b603", "selectedOptionIds": ["a"], "numericValue": null, "markedForReview": false, "clientSeq": 3, "updatedAt": "2026-11-03T09:18:00.000Z" }],
  "violations": [{ "type": "tab_hidden", "meta": {}, "occurredAt": "2026-11-03T09:20:00.000Z" }]
}
```

An attempt has `in_progress` or `submitted`. Attempt responses always contain `serverTime`. In-progress attempt state never includes `score`, answer keys, explanations, or correctness.

While an attempt is in progress, no role receives answer keys, explanations, correctness, or grading detail. A student receives only their own saved answers; teacher/admin monitoring uses aggregate progress and violation counts and must not expose a student's selected answers before submission.

```json
{
  "attemptId": "6650cc002c0d42bd31f4b604",
  "exam": { "id": "6650ca002c0d42bd31f4b602", "title": "DSA Midterm" },
  "status": "submitted",
  "submittedAt": "2026-11-03T10:00:00.000Z",
  "score": 38,
  "maxScore": 50,
  "percentage": 76,
  "passPercentage": 40,
  "passed": true,
  "timeTakenSeconds": 2520,
  "violationCount": 1,
  "items": [{ "itemId": "6650cb002c0d42bd31f4b603", "order": 1, "prompt": "Which traversal visits root before children?", "type": "single_choice", "options": [{ "id": "a", "text": "Preorder" }], "selectedOptionIds": ["a"], "numericValue": null, "correctOptionIds": ["a"], "numericAnswer": null, "awardedMarks": 2, "isCorrect": true, "explanation": "Preorder processes the root first." }]
}
```

Results are visible to the student only after release. Teachers and admins may receive result answers and grading detail for authorized exams.

#### Analytics and pagination

```json
{
  "examId": "6650ca002c0d42bd31f4b602",
  "examTitle": "DSA Midterm",
  "attemptCount": 42,
  "submittedCount": 38,
  "inProgressCount": 4,
  "notStartedCount": 8,
  "averageScore": 31.5,
  "averagePercentage": 63,
  "maxScore": 50,
  "passCount": 30,
  "failCount": 8,
  "passPercentage": 40,
  "scoreDistribution": [{ "label": "0-9", "min": 0, "max": 9, "count": 2 }],
  "itemStats": [{ "itemId": "6650cb002c0d42bd31f4b603", "order": 1, "prompt": "Which traversal visits root before children?", "attemptedCount": 40, "correctCount": 31, "correctPercentage": 77.5, "averageAwardedMarks": 1.55, "averageTimeSeconds": 40 }],
  "leaderboard": [{ "rank": 1, "studentId": "...", "studentName": "Asha Kumar", "score": 48, "maxScore": 50, "percentage": 96, "submittedAt": "2026-11-03T10:00:00.000Z" }],
  "averageTimeSeconds": 2520,
  "averageTimePerQuestionSeconds": 210
}
```

```json
{ "page": 2, "limit": 20, "total": 57, "totalPages": 3, "hasNextPage": true, "hasPreviousPage": true }
```

## Endpoints

### Auth

#### POST `/auth/register`
**Auth/roles:** public. **Body:** `name` string 2–80, `email` valid email, `password` string 8–72, `role` optional `student|teacher` (defaults to student); self-registration cannot create admins.  
**Success `201`:** `{ "success": true, "data": { "user": { "id": "...", "name": "Asha Kumar", "email": "asha@example.com", "role": "student", "batchIds": [], "isActive": true }, "accessToken": "eyJ..." } }` and a refresh cookie.  
**Errors:** `400 VALIDATION_ERROR`, `409 DUPLICATE_EMAIL`, `429 RATE_LIMITED`.

#### POST `/auth/login`
**Auth/roles:** public. **Body:** `email` valid email; `password` string 1–72.  
**Success `200`:** `{ "success": true, "data": { "user": { "id": "...", "name": "Asha Kumar", "email": "asha@example.com", "role": "student", "batchIds": [], "isActive": true }, "accessToken": "eyJ..." } }` and a rotated refresh cookie.  
**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED` (invalid credentials or inactive account), `429 RATE_LIMITED`.

#### POST `/auth/refresh`
**Auth/roles:** refresh cookie required. **Body:** none.  
**Success `200`:** `{ "success": true, "data": { "accessToken": "eyJ..." } }` and a rotated refresh cookie.  
**Errors:** `401 UNAUTHORIZED`, `429 RATE_LIMITED`.

#### POST `/auth/logout`
**Auth/roles:** authenticated. **Body:** none.  
**Success `200`:** `{ "success": true, "data": { "message": "Logged out." } }` and clears refresh cookie.  
**Errors:** `401 UNAUTHORIZED`.

#### GET `/auth/me`
**Auth/roles:** any authenticated role. **Query/body:** none.  
**Success `200`:** `{ "success": true, "data": { "id": "...", "name": "Asha Kumar", "email": "asha@example.com", "role": "student", "batchIds": [], "isActive": true } }`.  
**Errors:** `401 UNAUTHORIZED`, `404 NOT_FOUND`.

### Users

#### GET `/users`
**Auth/roles:** admin. **Query:** optional `role` enum, `q` 1–100 chars, `page` positive integer, `limit` 1–100.  
**Success `200`:** `{ "success": true, "data": [{ "id": "...", "name": "Asha Kumar", "email": "asha@example.com", "role": "student", "batchIds": ["CSE-A"], "isActive": true }], "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1, "hasNextPage": false, "hasPreviousPage": false, "summary": { "total": 23, "active": 22, "inactive": 1, "roleCounts": { "admin": 1, "teacher": 2, "student": 20 } }, "batches": [{ "id": "CSE-A", "name": "CSE A" }] } }`. Filters: `batch` is a batch slug and `isActive` is `true` or `false`.  
**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`.

#### PATCH `/users/:id`
**Auth/roles:** admin. **Params:** `id` ObjectId. **Body:** one or more of `name` string 2–80, `role` enum, `batchIds` unique batch-slug array max 50, `isActive` boolean; password fields are forbidden.  
**Success `200`:** `{ "success": true, "data": { "id": "...", "name": "Asha Kumar", "email": "asha@example.com", "role": "student", "batchIds": ["..."], "isActive": true } }`.  
**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`.

### Questions

#### POST `/questions`
**Auth/roles:** teacher or admin. **Body:** question fields from the shared Question shape except server-owned IDs/timestamps; `subject`/`topic` 1–80 chars, `difficulty` `easy|medium|hard`.  
**Success `201`:** `{ "success": true, "data": { "id": "...", "subject": "Data Structures", "topic": "Trees", "difficulty": "medium", "type": "single_choice", "prompt": "Which traversal visits root before children?", "options": [{ "id": "a", "text": "Preorder" }], "correctOptionIds": ["a"], "numericAnswer": null, "explanation": "Preorder processes the root first.", "defaultMarks": 2, "negativeMarks": 0, "createdBy": "..." } }`.  
**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`.

#### GET `/questions`
**Auth/roles:** teacher (own questions) or admin (all). **Query:** optional `subject`, `topic` (1–80), `difficulty`, `type`, `q` (1–100), `page`, `limit`.  
**Success `200`:** `{ "success": true, "data": [{ "id": "...", "subject": "Data Structures", "topic": "Trees", "difficulty": "medium", "type": "single_choice", "prompt": "Which traversal visits root before children?", "options": [{ "id": "a", "text": "Preorder" }], "correctOptionIds": ["a"], "numericAnswer": null, "explanation": "Preorder processes the root first.", "defaultMarks": 2, "negativeMarks": 0, "updatedAt": "2026-10-01T08:00:00.000Z" }], "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1, "hasNextPage": false, "hasPreviousPage": false, "facets": { "subjects": ["Data Structures"], "topics": ["Trees"] } } }`. Facets list every subject/topic visible to the caller, not only the current page.  
**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`.

#### GET `/questions/:id`
**Auth/roles:** owning teacher or admin. **Params:** `id` ObjectId.  
**Success `200`:** `{ "success": true, "data": { "id": "...", "subject": "Data Structures", "topic": "Trees", "difficulty": "medium", "type": "single_choice", "prompt": "Which traversal visits root before children?", "options": [{ "id": "a", "text": "Preorder" }], "correctOptionIds": ["a"], "numericAnswer": null, "explanation": "Preorder processes the root first.", "defaultMarks": 2, "negativeMarks": 0 } }`.  
**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`.

#### PATCH `/questions/:id`
**Auth/roles:** owning teacher or admin. **Params:** `id` ObjectId. **Body:** any editable Question fields; full question validation applies after merge.  
**Success `200`:** `{ "success": true, "data": { "id": "...", "prompt": "Which traversal visits root before children?", "type": "single_choice", "correctOptionIds": ["a"], "defaultMarks": 2, "negativeMarks": 0 } }`.  
**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`.

#### DELETE `/questions/:id`
**Auth/roles:** owning teacher or admin. **Params:** `id` ObjectId.  
**Success `200`:** `{ "success": true, "data": { "id": "...", "deleted": true } }`.  
**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 INVALID_STATE` (question is protected by an unpublished draft policy, if adopted).

#### POST `/questions/import`
**Auth/roles:** teacher or admin. **Content type:** `multipart/form-data`; field `file`, one CSV/XLSX, max 5 MB. CSV/XLSX columns map to the Question fields; row 2 onward are data rows.  
**Success `200`:** `{ "success": true, "data": { "createdCount": 2, "failedCount": 1, "errors": [{ "row": 4, "code": "VALIDATION_ERROR", "message": "single_choice needs exactly one correct option." }] } }`.  
**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `413 FILE_TOO_LARGE`, `415 UNSUPPORTED_FILE_TYPE`, `422 IMPORT_VALIDATION_FAILED`.

### Exams

#### POST `/exams`
**Auth/roles:** teacher or admin. **Body:** `title` 3–150, optional `description` max 2000, `durationMinutes` integer 1–480, `startAt`/`endAt` future ISO times with start before end, optional `assignment.batchIds` unique batch-slug array max 50, `assignment.joinCodeEnabled` boolean, and `items` array max 200 with `{ questionId: ObjectId, marks: number 0–100, negativeMarks: number 0–100 }`. Drafts may have zero items.  
**Success `201`:** `{ "success": true, "data": { "id": "...", "title": "DSA Midterm", "description": "Trees and graphs", "durationMinutes": 45, "startAt": "2026-11-03T09:00:00.000Z", "endAt": "2026-11-03T11:00:00.000Z", "status": "draft", "assignment": { "batchIds": ["..."], "joinCodeEnabled": true }, "items": [{ "questionId": "...", "marks": 2, "negativeMarks": 0 }] } }`.  
**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND` (referenced question hidden/not found).

#### GET `/exams`
**Auth/roles:** teacher (own) or admin (all). **Query:** optional `status` `draft|published`, `page`, `limit`.  
**Success `200`:** `{ "success": true, "data": [{ "id": "...", "title": "DSA Midterm", "description": "Trees and graphs", "durationMinutes": 45, "startAt": "2026-11-03T09:00:00.000Z", "endAt": "2026-11-03T11:00:00.000Z", "status": "published", "phase": "live", "resultMode": "after_end", "assignment": { "batchIds": ["CSE-A"], "joinCodeEnabled": true }, "joinCode": "DSA-2048", "itemCount": 12, "totalMarks": 50, "createdBy": "...", "publishedAt": "2026-10-28T08:00:00.000Z", "resultsReleasedAt": null }], "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1, "hasNextPage": false, "hasPreviousPage": false, "summary": { "live": 1, "upcoming": 0, "ended": 0, "published": 1, "draft": 0 }, "batches": [{ "id": "CSE-A", "name": "CSE-A" }] } }`. `q` filters by title. Batch IDs are opaque slugs such as `CSE-A`, not ObjectIds.  
**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`.

#### GET `/exams/available`
**Auth/roles:** student. **Query:** optional `scope` `upcoming|live|past|all` (default `all`), `page`, `limit`.  
**Success `200`:** `{ "success": true, "data": [{ "id": "...", "title": "DSA Midterm", "description": "Trees and graphs", "durationMinutes": 45, "startAt": "2026-11-03T09:00:00.000Z", "endAt": "2026-11-03T11:00:00.000Z", "availability": "upcoming", "attemptStatus": null, "attemptId": null, "canStart": false, "canResume": false, "resultAvailable": false, "score": null, "percentage": null, "passed": null, "itemCount": 12, "totalMarks": 50, "policy": { "passPercentage": 40, "violationLimit": 3, "autoSubmitOnViolation": true } }], "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1, "hasNextPage": false, "hasPreviousPage": false, "serverTime": "2026-11-03T08:55:00.000Z" } }`. Rows use the student-facing exam metadata shape above. `scope=past` includes ended exams and submitted attempts; `scope=live` includes only live exams that are not yet submitted.  
**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`.

#### GET `/exams/:id`
**Auth/roles:** owning teacher, admin, or assigned student. **Params:** `id` ObjectId. A student gets metadata only, never question content/answers before starting.  
**Success `200`:** For a student, the data is the student-facing exam metadata shape above. For an owning teacher or admin, the data is the full teacher/admin Exam shape (including `items`, `settings`, `resultMode`, `joinCode`, and `resultsReleasedAt`).  
**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`.

#### PATCH `/exams/:id`
**Auth/roles:** owning teacher or admin. **Params:** `id` ObjectId. **Body:** editable create-exam fields. Published exams reject changes to items, timing, and assignments; title/description changes may be allowed by policy.  
**Success `200`:** `{ "success": true, "data": { "id": "...", "title": "DSA Midterm updated", "status": "draft", "items": [{ "questionId": "...", "marks": 2, "negativeMarks": 0 }] } }`.  
**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 INVALID_STATE`.

#### POST `/exams/:id/publish`
**Auth/roles:** owning teacher or admin. **Params:** `id` ObjectId. **Body:** none. The server resolves each referenced question and stores immutable content and marking snapshots.  
**Success `200`:** `{ "success": true, "data": { "id": "...", "status": "published", "joinCode": "DSA-2048", "publishedAt": "2026-10-28T08:00:00.000Z" } }`.  
**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 INVALID_STATE` (already published or no items).

#### POST `/exams/join`
**Auth/roles:** student. **Body:** `joinCode` string 4–32, trimmed and case-insensitive.  
**Success `200`:** `{ "success": true, "data": { "id": "...", "title": "DSA Midterm", "description": "Trees and graphs", "durationMinutes": 45, "startAt": "2026-11-03T09:00:00.000Z", "endAt": "2026-11-03T11:00:00.000Z", "availability": "upcoming", "attemptStatus": null, "attemptId": null, "canStart": false, "canResume": false, "resultAvailable": false, "score": null, "percentage": null, "passed": null, "itemCount": 12, "totalMarks": 50, "policy": { "passPercentage": 40, "violationLimit": 3, "autoSubmitOnViolation": true } } }`. The data is the student-facing exam metadata shape above; joining is idempotent and adds the exam to the student's dashboard.  
**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `403 EXAM_NOT_LIVE` (unpublished/ended), `404 NOT_FOUND` (invalid code).

### Attempts

#### POST `/exams/:id/start`
**Auth/roles:** assigned/joined student. **Params:** `id` ObjectId. **Body:** none. Server sets `startedAt=serverTime` and `expiresAt=min(startedAt + durationMinutes, exam.endAt)`. The unique `(examId, studentId)` index enforces one attempt.  
**Success `201` (new) / `200` (resume):** `{ "success": true, "data": { "attemptId": "...", "exam": { "id": "...", "title": "DSA Midterm", "durationMinutes": 45, "resultMode": "after_end", "resultReleaseAt": "2026-11-03T11:00:00.000Z", "passPercentage": 40, "violationPolicy": { "maxViolations": 3, "autoSubmit": true } }, "status": "in_progress", "startedAt": "2026-11-03T09:15:00.000Z", "expiresAt": "2026-11-03T10:00:00.000Z", "serverTime": "2026-11-03T09:15:00.000Z", "maxScore": 50, "violationCount": 0, "questions": [{ "id": "...", "order": 1, "marks": 2, "negativeMarks": 0, "question": { "prompt": "Which traversal visits root before children?", "type": "single_choice", "options": [{ "id": "a", "text": "Preorder" }, { "id": "b", "text": "Inorder" }] } }], "savedAnswers": [] } }`. The returned question set is already shuffled and frozen for this attempt; answer keys are never included. Starting again while in progress returns the same attempt.  
**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `403 EXAM_NOT_LIVE`, `404 NOT_FOUND`, `409 ALREADY_ATTEMPTED`.

#### GET `/attempts/:id`
**Auth/roles:** owning student, owning exam teacher, or admin. **Params:** `id` ObjectId. Reading lazily finalizes an expired in-progress attempt. Student in-progress response contains student-safe question items and `serverTime`; teacher/admin receives authorized monitoring state.  
**Success `200`:** For an in-progress student attempt, the data is the same attempt-state shape returned by start (including `attemptId`, `exam`, `expiresAt`, `serverTime`, `maxScore`, `violationCount`, `questions`, and `savedAnswers`). For a submitted attempt, the data is the submitted summary below. For an owning teacher or admin, the data is monitoring state: `{ "attemptId": "...", "examId": "...", "student": { ... }, "status": "in_progress", "startedAt": "...", "expiresAt": "...", "submittedAt": null, "answerCount": 12, "violationCount": 1, "serverTime": "..." }`.  
**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`.

#### PATCH `/attempts/:id/answer`
**Auth/roles:** owning student. **Params:** `id` ObjectId. **Body:** `itemId` ObjectId, optional `selectedOptionIds` unique option-ID array max 6, optional `numericValue` finite number, optional `markedForReview` boolean, `clientSeq` non-negative integer. Exactly the answer fields valid for the item type are accepted; later `clientSeq` wins to tolerate delayed client writes. Server lazily finalizes before write.  
**Success `200`:** `{ "success": true, "data": { "itemId": "...", "selectedOptionIds": ["a"], "numericValue": null, "markedForReview": false, "clientSeq": 3, "updatedAt": "2026-11-03T09:18:00.000Z", "serverTime": "2026-11-03T09:18:00.000Z" } }`.  
**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 ATTEMPT_EXPIRED`, `409 INVALID_STATE` (already submitted).

#### POST `/attempts/:id/violation`
**Auth/roles:** owning student. **Params:** `id` ObjectId. **Body:** `type` enum `tab_hidden|window_blur|fullscreen_exit|copy|paste|context_menu|shortcut|other`; optional `meta` plain JSON object max 2 KB with no secrets. Server lazily finalizes before write.  
**Success `201`:** `{ "success": true, "data": { "type": "tab_hidden", "occurredAt": "2026-11-03T09:20:00.000Z", "violationCount": 1, "maxViolations": 3, "autoSubmitted": false, "attemptStatus": "in_progress", "serverTime": "2026-11-03T09:20:00.000Z" } }`. When the policy limit is reached with `autoSubmitOnViolation`, `autoSubmitted` is true, `attemptStatus` is `submitted`, and `submittedAt` is included.  
**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 ATTEMPT_EXPIRED`, `409 INVALID_STATE`.

#### POST `/attempts/:id/submit`
**Auth/roles:** owning student. **Params:** `id` ObjectId. **Body:** none. The service atomically transitions only `in_progress → submitted`; grading is a pure server function. Repeated requests return the same submitted representation without another grade operation.  
**Success `200`:** `{ "success": true, "data": { "attemptId": "...", "status": "submitted", "submittedAt": "2026-11-03T09:58:00.000Z", "serverTime": "2026-11-03T09:58:00.000Z", "resultAvailable": true, "resultReleaseAt": "2026-11-03T09:58:00.000Z" } }`. `resultReleaseAt` is the policy time at which a sealed result becomes visible (or `null` for manual release). This same summary is returned for a submitted attempt read through `GET /attempts/:id`. A prior submitted attempt is successful and idempotent: the same `submittedAt` is returned and no second grade operation occurs.  
**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`.

#### GET `/attempts/:id/result`
**Auth/roles:** owning student, owning exam teacher, or admin. **Params:** `id` ObjectId. Student result requires released results; teachers/admins can view authorized results after submission.  
**Success `200`:** `{ "success": true, "data": { "attemptId": "...", "exam": { "id": "...", "title": "DSA Midterm" }, "status": "submitted", "submittedAt": "2026-11-03T10:00:00.000Z", "score": 38, "maxScore": 50, "percentage": 76, "passPercentage": 40, "passed": true, "timeTakenSeconds": 2520, "violationCount": 1, "items": [{ "itemId": "...", "order": 1, "prompt": "Which traversal visits root before children?", "type": "single_choice", "options": [{ "id": "a", "text": "Preorder" }], "selectedOptionIds": ["a"], "numericValue": null, "correctOptionIds": ["a"], "numericAnswer": null, "awardedMarks": 2, "isCorrect": true, "explanation": "Preorder processes the root first." }] } }`. A student response also includes `scoreHistory` (up to ten released attempts: `{ examId, examTitle, percentage, submittedAt }`); a teacher/admin response includes the attempt's `student` instead.  
**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `403 RESULT_NOT_AVAILABLE`, `404 NOT_FOUND`, `409 INVALID_STATE` (attempt not submitted).

### Teacher reporting

#### GET `/exams/:id/monitor`
**Auth/roles:** owning teacher or admin. **Params:** `id` ObjectId. **Query:** optional `status` `not_started|in_progress|submitted`, `q` name/email search, `page`, `limit`.  
**Success `200`:** `{ "success": true, "data": [{ "attemptId": null, "student": { "id": "...", "name": "Asha Kumar", "email": "asha@example.com" }, "status": "not_started", "startedAt": null, "expiresAt": null, "submittedAt": null, "answerCount": 0, "violationCount": 0, "lastActivityAt": null }], "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1, "hasNextPage": false, "hasPreviousPage": false, "serverTime": "2026-11-03T09:20:00.000Z", "counts": { "notStarted": 0, "inProgress": 1, "submitted": 0 } } }`. Counts are calculated across all eligible students before `status`/`q` filtering.  
**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`.

#### GET `/exams/:id/results`
**Auth/roles:** owning teacher or admin. **Params:** `id` ObjectId. **Query:** optional `q` 1–100, `page`, `limit`.  
**Success `200`:** `{ "success": true, "data": [{ "attemptId": "...", "student": { "id": "...", "name": "Asha Kumar", "email": "asha@example.com" }, "status": "submitted", "score": 38, "maxScore": 50, "percentage": 76, "passed": true, "submittedAt": "2026-11-03T10:00:00.000Z", "timeTakenSeconds": 2520, "violationCount": 1 }], "meta": { "page": 1, "limit": 20, "total": 1, "totalPages": 1, "hasNextPage": false, "hasPreviousPage": false } }`. Submitted attempts are sorted newest first; results are visible to the owning teacher/admin regardless of student release mode.  
**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`.

#### GET `/exams/:id/analytics`
**Auth/roles:** owning teacher or admin. **Params:** `id` ObjectId. **Query/body:** none.  
**Success `200`:** `{ "success": true, "data": { "examId": "...", "examTitle": "DSA Midterm", "attemptCount": 42, "submittedCount": 38, "inProgressCount": 4, "notStartedCount": 8, "averageScore": 31.5, "averagePercentage": 63, "maxScore": 50, "passCount": 30, "failCount": 8, "passPercentage": 40, "scoreDistribution": [{ "label": "0-9", "min": 0, "max": 9, "count": 2 }], "itemStats": [{ "itemId": "...", "order": 1, "prompt": "Which traversal visits root before children?", "attemptedCount": 40, "correctCount": 31, "correctPercentage": 77.5, "averageAwardedMarks": 1.55, "averageTimeSeconds": 40 }], "leaderboard": [{ "rank": 1, "studentId": "...", "studentName": "Asha Kumar", "score": 48, "maxScore": 50, "percentage": 96, "submittedAt": "..." }], "averageTimeSeconds": 2520, "averageTimePerQuestionSeconds": 210 } }`. The distribution always contains ten bands (`0-9` through `100`).  
**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`.

#### POST `/exams/:id/release-results`
**Auth/roles:** owning teacher or admin. **Params:** `id` ObjectId. **Body:** none. This is idempotent; it records `resultsReleasedAt` once.  
**Success `200`:** `{ "success": true, "data": { "id": "...", "resultsReleasedAt": "2026-11-03T11:00:00.000Z" } }`.  
**Errors:** `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`, `409 INVALID_STATE` (exam not published).

#### GET `/exams/:id/results/export.csv`
**Auth/roles:** owning teacher or admin. **Params:** `id` ObjectId. **Query:** none. Response is `200 text/csv` with `Content-Disposition: attachment; filename="dsa-midterm-results.csv"`; columns: `studentName,email,status,score,maxScore,percentage,passed,submittedAt,violationCount`. All text cells are quoted.  
**Success `200` example:** `studentName,email,status,score,maxScore,percentage,passed,submittedAt,violationCount\n"Asha Kumar","asha@example.com","submitted",38,50,76,"true","2026-11-03T10:00:00.000Z",1\n`.  
**Errors:** JSON `400 VALIDATION_ERROR`, `401 UNAUTHORIZED`, `403 FORBIDDEN`, `404 NOT_FOUND`.

## Client safety requirements

- Treat `serverTime` and `expiresAt` as the source for the timer; client clock calculations are display-only.
- Never calculate grades, totals, authorization, expiry, or result visibility on the client.
- Do not cache or log answer keys/explanations while an attempt is in progress.
- On `401`, refresh once, wait for the shared refresh request, retry once, then clear client auth state if refresh fails.
- A `409 ATTEMPT_EXPIRED` should take the student to the submitted/expired state and refetch their result only when release permits it.
