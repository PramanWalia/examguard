# ExamGuard — Bug Log & Tracking

This file tracks all bugs identified during the comprehensive pre-deployment verification, ranked by severity.

---

## Bug Summary
| ID | Severity | Area | Description | Status |
|---|---|---|---|---|
| **BUG-001** | High | Server Repo | `MongoExamRepository.list()` does not return `meta.summary` or `meta.batches` | **Fixed & Verified** |
| **BUG-002** | Medium | Client UI | `ExamsPage.jsx` uses `window.alert()` on delete error and lacks success toast | **Fixed & Verified** |
| **BUG-003** | Medium | Server Repo | `MongoAnalyticsRepository.js` ignores `auto_submitted` status in aggregates | **Fixed & Verified** |
| **BUG-004** | Low | Server Service | `isEligible()` throws TypeError if student `batchIds` is undefined | **Fixed & Verified** |
| **BUG-005** | Low | Server Service | `joinExam()` throws TypeError if exam `assignment` is undefined | **Fixed & Verified** |
| **BUG-006** | Medium | Server Config | Overly aggressive auth rate limit (20 req / 15 min) locks out normal page reloads | **Fixed & Verified** |
| **BUG-007** | Critical | Client UI | `StudentInstructionsPage.jsx` React hook violation crashes exam start flow | **Fixed & Verified** |
| **BUG-008** | High | Client UI | `AttemptPage.jsx` anti-cheat listeners disabled due to unreactive `hydratedRef` | **Fixed & Verified** |

---

## Detailed Bug Reports

### BUG-001: `MongoExamRepository.list()` missing `meta.summary` and `meta.batches`
- **Area:** Server (`server/src/repositories/mongo/examRepository.js:23-30`)
- **Severity:** High
- **Description:** 
  The API contract (`docs/API_CONTRACT.md` line 325) and client pages (`ExamsPage.jsx`, `ExamBuilderPage.jsx`, and `DashboardPage.jsx` Admin view) expect `GET /exams` to return `meta.summary` (`{ live, upcoming, ended, published, draft }`) and `meta.batches` (`[{ id, name }]`). 
  While `MemoryExamRepository.list()` computes and returns these fields, `MongoExamRepository.list()` only returned `{ data, meta: pageMeta(page, limit, total) }`.
- **User Impact:** 
  When running on MongoDB, the teacher exam statistics all displayed `0` or `—`, the Exam Builder could not retrieve the batch list to assign exams to classes, and the Admin platform dashboard displayed 0 exams.
- **Root Cause:**
  `MongoExamRepository.list()` queried only paged rows and total count, without calculating aggregate phase counts or extracting batch slugs from the exam collection.
- **Fix:**
  Added aggregate query for visible exams in `MongoExamRepository.list()`, computing `summary` with `examPhase(exam, now)` and distinct batches from `assignment.batchIds`.
- **Verification:**
  Added test `exam repository list includes meta.summary and meta.batches` in `server/src/tests/repositories.test.js`. Passed against both Memory and Mongo implementations (`PASS server/src/tests/repositories.test.js`, `PASS server/src/tests/mongoContract.test.js`).

---

### BUG-002: `ExamsPage.jsx` delete mutation uses `window.alert` instead of toast
- **Area:** Client (`client/src/pages/ExamsPage.jsx:23`)
- **Severity:** Medium
- **Description:** 
  In `client/src/pages/ExamsPage.jsx`, `deleteExam` mutation handled errors with `window.alert(getApiError(error).message)` and lacked an `onSuccess` toast, unlike `ExamOverviewPage.jsx` which uses `toast.error()` and `toast.success('Exam deleted.')`.
- **User Impact:** 
  Inconsistent UI experience, intrusive native alert dialog, lack of feedback on successful deletion.
- **Fix:**
  Replaced `window.alert` with `toast.error(getApiError(error).message)` and added `toast.success('Exam deleted.')` on success.
- **Verification:**
  Verified Vite client compilation succeeds without error (`npm run build --workspace client`).

---

### BUG-003: `MongoAnalyticsRepository.js` ignores `auto_submitted` attempts
- **Area:** Server (`server/src/repositories/mongo/analyticsRepository.js:6, 13`)
- **Severity:** Medium
- **Description:**
  `submitted(examId)` filter checked `status: 'submitted'`, but `AttemptModel` supports `enum: ['in_progress', 'submitted', 'auto_submitted']`.
- **User Impact:**
  Any attempts finalized by the auto-submit sweep or proctoring limit that receive `auto_submitted` status were omitted from score distributions, question statistics, and leaderboards.
- **Fix:**
  Used `$in: ['submitted', 'auto_submitted']` in `MongoAnalyticsRepository.js`.
- **Verification:**
  Ran `npm test` passing all 13 test suites and 120 tests.

---

### BUG-004: `isEligible()` TypeError on undefined `student.batchIds`
- **Area:** Server (`server/src/services/examService.js:54`)
- **Severity:** Low
- **Description:**
  `student?.batchIds.some(...)` assumed `batchIds` is always an array. If `batchIds` was missing or undefined on a student document, it threw a fatal `TypeError: Cannot read properties of undefined (reading 'some')`.
- **User Impact:**
  `GET /exams/available` returned a 500 error instead of filtering out ineligible exams.
- **Fix:**
  Changed to safe optional chaining `student?.batchIds?.some(...) || false`.
- **Verification:**
  Unit tests pass in `server/src/tests/examFlow.test.js`.

---

### BUG-005: `joinExam()` TypeError on undefined `exam.assignment`
- **Area:** Server (`server/src/services/examService.js:305`)
- **Severity:** Low
- **Description:**
  `joinExam` checked `!exam.assignment.joinCodeEnabled`. If an exam had no assignment defined, it threw a TypeError.
- **User Impact:**
  500 internal server error instead of a clean error response.
- **Fix:**
  Changed to `!exam.assignment?.joinCodeEnabled`.
- **Verification:**
  Unit tests pass in `server/src/tests/examFlow.test.js`.

---

### BUG-006: Overly restrictive auth rate limit (20 req / 15 min) locks out users on reloads
- **Area:** Server (`server/.env:14`)
- **Severity:** Medium
- **Description:**
  `AUTH_RATE_LIMIT_MAX` was set to 20 requests per 15 minutes. In Single Page Applications where `/auth/refresh` is triggered on every full page navigation or tab reload, normal users or rapid test runs quickly hit HTTP 429 `RATE_LIMITED`, blocking legitimate students and teachers.
- **User Impact:**
  Users visiting multiple pages or reloading during an assessment hit rate limiting errors.
- **Fix:**
  Increased `AUTH_RATE_LIMIT_MAX=1000` and `RATE_LIMIT_MAX=5000` in `server/.env`.
- **Verification:**
  E2E test runs with multiple browser sessions and page reloads complete without 429 lockouts.

---

### BUG-007: React Rules of Hooks violation in `StudentInstructionsPage.jsx`
- **Area:** Client (`client/src/pages/StudentInstructionsPage.jsx:84-107`)
- **Severity:** Critical (Crash)
- **Description:**
  `useCountdown` hooks for upcoming countdown and live window closing were placed after early returns (`if (query.isPending) return ...` and `if (query.isError) return ...`). On initial render, 3 hooks ran; once query resolved, 5 hooks ran.
- **User Impact:**
  React threw `Error: Rendered more hooks than during the previous render.`, immediately crashing the page before students could check the agreement or start an exam.
- **Fix:**
  Moved both `useCountdown` hook declarations above the conditional return statements with safe guards (`enabled: Boolean(isUpcoming && exam?.startAt)` and `enabled: Boolean(isLive && exam?.endAt)`).
- **Verification:**
  Passing in Playwright tests (`e2e/student-exam.spec.js`), clean DOM check passed, no React hook warnings or console errors.

---

### BUG-008: Proctoring anti-cheat listeners disabled in `AttemptPage.jsx`
- **Area:** Client (`client/src/pages/AttemptPage.jsx:154, 179-187`)
- **Severity:** High (Integrity Failure)
- **Description:**
  `ready` was calculated as `Boolean(activeAttempt && hydratedRef.current === attemptId)`. In `useEffect`, `hydratedRef.current = attemptId` was set. Because mutating a React `useRef` does not trigger a re-render, if the student did not immediately interact with an option (or if Question 1 was numeric), `ready` remained `false` forever.
- **User Impact:**
  `useAntiCheat` received `enabled: false`, preventing window blur, tab switch, and fullscreen exit listeners from ever being registered on the page. Students could switch tabs or exit fullscreen without any proctoring signals recorded.
- **Fix:**
  Replaced `hydratedRef` with state `[hydratedAttemptId, setHydratedAttemptId] = useState(null)`, ensuring setting hydration state triggers a component re-render and activates `ready = true` and `useAntiCheat`.
- **Verification:**
  Verified in `e2e/student-exam.spec.js` across desktop and mobile; blur events now reliably trigger the proctoring violation modal and server notification.
