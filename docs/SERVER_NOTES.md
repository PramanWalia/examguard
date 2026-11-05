# ExamGuard server notes

The Express API implements `docs/API_CONTRACT.md` behind the `/api/v1` prefix.
It uses repository interfaces with both an in-memory driver (`REPOSITORY_DRIVER=memory` for local development/tests) and a MongoDB driver (`REPOSITORY_DRIVER=mongo`, required in production).

## Run

```bash
npm install
npm run dev            # http://localhost:5000/api/v1
npm run seed           # dry run: prints the accounts, then exits
npm test               # Jest + Supertest (memory + Mongo memory server)
npm run test:mongo     # Mongo repository + integration tests
npm run lint --workspace server
npm run test:contract --workspace server
```

Environment defaults live in `server/src/config/env.js`; copy
`server/.env.example` to `server/.env` only when you need to override them.
Production deployments (`NODE_ENV=production`) enforce:
- `REPOSITORY_DRIVER=mongo` and a valid `MONGODB_URI`
- `SEED_ON_START=false`
- Unique, strong `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` values (development defaults are rejected)

### Account provisioning

Demo accounts and demo exams are disabled by default (`SEED_ON_START=false`) and strictly refused in production. Administrators are provisioned securely through dedicated environment configuration. Set `SEED_ON_START=true` only for isolated local development environments that intentionally need demo fixtures.

Teacher self-registration requires either:
1. A valid faculty invite code matching `TEACHER_INVITE_CODE`, which activates the teacher account immediately, or
2. Administrator approval (`isActive: false, approvalStatus: 'pending'` on registration until an administrator activates the account via `PATCH /api/v1/users/:id`).

## Authentication

- Access token: `Authorization: Bearer <jwt>`, 15 minutes, carrying `{ sub, role, tokenVersion, sid }`.
- Refresh token: `httpOnly`, `SameSite=Lax` cookie (`Secure` in production), carrying `{ sub, tokenVersion, sid, jti }`.
- Each login creates an independent session record `{ sid, jti, expiresAt }`. Refreshing rotates only that session's `jti` without invalidating other tabs or devices. Replaying an already-rotated `jti` revokes that session (`sid`).
- `logout` revokes the current session (`sid`), and administrative role/status changes increment `tokenVersion` to invalidate all sessions for that user.
- Passwords use bcrypt cost 12 (4 in tests). Login returns one generic message for unknown email, wrong password, and inactive account.

## Route access

All routes are under `/api/v1`. **Auth** is the minimum role; ownership is checked by the service.

| Method | Path | Auth | Ownership rule |
|---|---|---|---|
| POST | `/auth/register` | public | — |
| POST | `/auth/login` | public | — |
| POST | `/auth/refresh` | refresh cookie | — |
| POST | `/auth/logout` | any | — |
| GET | `/auth/me` | any | — |
| GET | `/users` | admin | — |
| PATCH | `/users/:id` | admin | cannot demote or deactivate self |
| GET | `/questions` | teacher, admin | teacher sees own; admin sees all |
| POST | `/questions` | teacher, admin | owns created row |
| POST | `/questions/import` | teacher, admin | CSV only; owns created rows |
| GET | `/questions/:id` | teacher, admin | owner or admin |
| PATCH | `/questions/:id` | teacher, admin | owner or admin |
| DELETE | `/questions/:id` | teacher, admin | owner or admin; archives if referenced |
| GET | `/exams` | teacher, admin | teacher sees own; admin sees all |
| POST | `/exams` | teacher, admin | may only reference own questions (admin: any) |
| GET | `/exams/available` | student | assigned batch or joined by code (filtered & paginated in DB) |
| POST | `/exams/join` | student | published + join-code enabled + not ended |
| GET | `/exams/:id` | any | owner/admin, or assigned student (metadata only) |
| PATCH | `/exams/:id` | teacher, admin | owner or admin; drafts or schedule reset |
| POST | `/exams/:id/publish` | teacher, admin | owner or admin; needs items |
| POST | `/exams/:id/start` | student | assigned/joined, live window |
| GET | `/exams/:id/monitor` | teacher, admin | owner or admin |
| GET | `/exams/:id/results` | teacher, admin | owner or admin |
| GET | `/exams/:id/analytics` | teacher, admin | owner or admin |
| GET | `/exams/:id/results/export.csv` | teacher, admin | owner or admin |
| POST | `/exams/:id/release-results` | teacher, admin | owner or admin |
| GET | `/attempts/:id` | any | owning student, owning exam teacher, or admin |
| PATCH | `/attempts/:id/answer` | student | owning student |
| POST | `/attempts/:id/heartbeat` | student | owning student |
| POST | `/attempts/:id/violation` | student | owning student |
| POST | `/attempts/:id/submit` | student | owning student |
| GET | `/attempts/:id/result` | any | owning student (released), owning exam teacher, or admin |

Unauthenticated requests get `401 UNAUTHORIZED` before any resource lookup, so they never reveal whether an id exists.

## Attempt invariants & server-side proctoring

The repository contract (`src/repositories/interfaces.js`) has dedicated atomic methods instead of generic updates:

- `createIfNoActive(examId, studentId, data, { maxAttempts })` — one active attempt; returns the existing attempt instead of creating a duplicate.
- `saveAnswerIfNewer(...)` — a delayed write with `clientSeq <= current` is rejected with `409 STALE_CLIENT_SEQ` and `details[0].currentSeq`.
- `finalizeIfInProgress(...)` — only the first `in_progress → submitted` transition wins and computes `timeTakenSeconds = submittedAt - startedAt` (capped at `durationMinutes * 60`).
- `findExpiredInProgress(now, limit)` — global cron sweep, 100 per minute.
- `findExpiredInProgressByExam(examId, now)` — targeted per-exam expiry check used when viewing monitor or results.
- `publish(id, teacherId, prepared)` — status, item snapshots, total marks, and join code change atomically.

In addition to browser-reported events (`tab_hidden`, `window_blur`, `fullscreen_exit`, `copy`, `paste`, `context_menu`, `shortcut`), the server records independent proctoring signals on attempt resume, answer save, and `POST /attempts/:id/heartbeat`:
- `ip_change`: client IP address changed mid-attempt
- `user_agent_change`: browser `User-Agent` header changed mid-attempt
- `heartbeat_missed`: gap between heartbeats/requests exceeded threshold
- `long_answer_gap`: unusually long inactivity gap between sequential answers

