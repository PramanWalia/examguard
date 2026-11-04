## ExamGuard API — implementation report

### Contract match
- `docs/API_CONTRACT.md` is the API specification source of truth.
- The Express app implements all endpoints listed; responses use the contract envelope
  `{ success: true, data: {}, meta: {} }` for success and
  `{ success: false, error: { code, message, details } }` for errors.

### What was built
All phases 0–10 delivered and hardened:
- **Phase 0–1**: Config/env with strict production startup guards (`SEED_ON_START=false` and `REPOSITORY_DRIVER=mongo` required in production), utilities (shuffle, ids, pagination, RFC-4180 CSV parser/serializer, examTime, errors, tokens, publicUser), repository interfaces + both `memory` and `mongo` implementations (`user`, `question`, `exam`, `attempt`, `analytics`).
- **Phase 2**: Express app split into `app.js` (no listen) and `server.js`; middleware order matches contract (helmet → cors → JSON limit → cookie-parser → mongo-sanitize → morgan → global rate limit → routes → 404 → error handler).
- **Phase 3**: Auth: register/login/refresh/rotation/logout/me with bcrypt cost 12, per-session refresh-token records (`sid` + `jti`) so refreshing one tab/device does not invalidate other active sessions, in-memory user/session cache in `MongoUserRepository`, and teacher registration gated by `TEACHER_INVITE_CODE` or admin approval.
- **Phase 4**: Question bank CRUD with ownership, filters/search/pagination, RFC-4180 CSV import via multer (5 MB cap; legacy `xlsx` dependency removed).
- **Phase 5**: Exam management (create/draft/published/read-only, database-level eligibility filtering and pagination for `availableExams`, engine: shuffle once, answer-key stripping, stale `clientSeq`, 5s grace on auto-submit, browser + server-side proctoring signals (`ip_change`, `user_agent_change`, `heartbeat_missed`, `long_answer_gap`), `POST /attempts/:id/heartbeat`, idempotent submit with `timeTakenSeconds` computation, result modes `immediate`/`after_end`/`manual`).
- **Phase 6**: Grading function with table-driven tests; partial marking: proportional correct-picks minus wrong-picks clamped to `[0, marks]`; negative marks only applied when partial marking is disabled.
- **Phase 7**: `node-cron` auto-submit sweep every minute, batch size 100, per-attempt try/catch isolation, and targeted `findExpiredInProgressByExam` query.
- **Phase 8**: Teacher monitor/results/release/analytics/CSV export (formula-injection safe: cells quoted, formula sigils prefixed with `'`); admin users + teacher approval + platform stats.
- **Phase 9**: Seed script matching MSW mock (guarded against `NODE_ENV=production`); contract-conformance tests; MongoDB integration and repository concurrency tests (`npm run test:mongo`).
- **Phase 10**: GitHub Actions CI workflow (`.github/workflows/ci.yml`) running lint, server tests, client tests, and build.

### Key architectural decisions
- Repository factory selected by `REPOSITORY_DRIVER` (`memory | mongo`); production requires `mongo`.
- `attempt.js` defines explicit Mongoose sub-schemas for `questionSet`, `examSnapshot`, `violations`, and `clientSession`.
- `refresh` rotates only the active session's `jti` (`sid` family); replay of an older `jti` revokes that session family.
- Teacher self-registration without a valid `inviteCode` creates an inactive account with `approvalStatus: 'pending'` until approved by an admin.