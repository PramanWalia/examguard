## ExamGuard API — one-pass implementation report

### Contract match
- `docs/API_CONTRACT.md` is the frozen source of truth; no changes were made to it.
- The Express app implements all endpoints listed; responses use the contract envelope
  `{ success: true, data: {}, meta: {} }` for success and
  `{ success: false, error: { code, message, details } }` for errors.

### What was built
All phases 0–10 delivered in one pass:
- **Phase 0–1**: Config/env, utilities (shuffle, ids, pagination, csv, examTime, errors, tokens, publicUser), repository interfaces + 5 memory implementations (user, question, exam, attempt, analytics).
- **Phase 2**: Express app split into `app.js` (no listen) and `server.js`; middleware order matches contract (helmet → cors → JSON limit → cookie-parser → mongo-sanitize → morgan → global rate limit → routes → 404 → error handler).
- **Phase 3**: Auth: register/login/refresh/rotation/logout/me with bcrypt cost 12, tokenVersion rotation, `requireAuth`/`requireRole` middleware.
- **Phase 4**: Question bank CRUD with ownership, filters/search/pagination, CSV/XLSX import via multer (5 MB cap).
- **Phase 5**: Exam management (create/draft/published/read-only, availability/join, engine: shuffle once, answer-key stripping, stale clientSeq, 5s grace on auto-submit, violations with auto-submit, idempotent submit, result modes immediate/after_end/manual).
- **Phase 6**: Grading function with 30+ table-driven tests; partial marking: proportional correct-picks minus wrong-picks clamped to [0, marks]; negative marks only applied when partial marking is disabled.
- **Phase 7**: `node-cron` auto-submit sweep every minute, batch size 100, per-attempt try/catch isolation.
- **Phase 8**: Teacher monitor/results/release/analytics/CSV export (formula-injection safe: cells quoted, formula sigils prefixed with `'`); admin users + platform stats (totalUsers, roleCounts, activeUsers, totalExams, publishedExams, draftExams, liveExams).
- **Phase 9**: Seed script matching MSW mock; contract-conformance script; hardening/Supertest integration tests; route auth/role/ownership table.
- **Phase 10**: All Jest + Supertest tests pass, Mongo deps removed, lint clean, `docs/SERVER_NOTES.md` written, Ponytail skipped/risk note added.

### Key architectural decisions (from design notes)
- Repository factory selected by `REPOSITORY_DRIVER` (`memory | mongo`), only memory implemented; Mongo throws with a clear message.
- Timestamps stored as ISO strings; ids generated with `crypto.randomBytes(12).toString('hex')` for 24-hex format.
- In-memory atomicity is synchronous check-and-set; not a DB substitute.
- Import cap at contract's 5 MB (`IMPORT_MAX_BYTES`), not the earlier 2 MB suggestion.
- CSV export cells quoted; formula sigils prefixed with `'` to neutralise Excel formulas.
- Published exams are read-only; updates return `409 INVALID_STATE`.
- `refresh`/`logout` increment `tokenVersion`, revoking previous access/refresh tokens (single-session rotation).
- Live-window start allowed with past `startAt` (lenient vs contract's "future" wording) to support seeded/live flows and tests.
- `STALE_CLIENT_SEQ` (not in contract catalogue) is returned for stale autosaves because the client explicitly handles it.
- `examRepo.publish(id, teacherId, prepared)` now takes pre-resolved items/snapshots instead of a synchronous callback.
- Teacher self-registration creates an active account (pending-approval idea dropped).
- Client expects `unwrap(response) = response.data.data`; `/auth/me` returns the user directly.

### Files deleted (obsolete server prototype)
- `models/`, `controllers/`, old root repositories, `utils/jwt.js`, `middleware/authMiddleware.js`, `validators/authValidator.js`, `routes/authRoutes.js`, old tests.

### Package changes
- `server/package.json`: removed `mongoose`, `mongodb-memory-server`, `@types/bcrypt`; added test:contract script.
- `server/.env.example`: updated defaults (REPOSITORY_DRIVER=memory, IMPORT_MAX_BYTES=5MB, BCRYPT_ROUNDS=12).

### Remaining to-do items (post-delivery)
- `docs/SERVER_NOTES.md` written but may need minor updates after this report.
- Manual smoke test against the live server verified (health, login, exams available).
- `npm test:contract` and `npm run lint` both pass.