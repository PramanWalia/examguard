# ExamGuard server notes

The Express API implements `docs/API_CONTRACT.md` behind the `/api/v1` prefix.
It uses repository interfaces with an in-memory driver; no database is required
to run or test it.

## Run

```powershell
npm install
npm run dev            # http://localhost:5000/api/v1
npm run seed           # dry run: prints the accounts, then exits
npm test               # Jest + Supertest
npm run lint --workspace server
npm run test:contract --workspace server
```

Environment defaults live in `server/src/config/env.js`; copy
`server/.env.example` to `server/.env` only when you need to override them.
Production deployments must set unique, strong `JWT_ACCESS_SECRET` and
`JWT_REFRESH_SECRET` values; the development defaults are rejected when
`NODE_ENV=production`.

### Account provisioning

Demo accounts and demo exams are not enabled on startup. Administrators are
provisioned separately with `npm run create-admin`; credentials are never
included in documentation or seed output. Set `SEED_ON_START=true` only for
isolated development/test environments that intentionally need fixtures.

## Authentication

- Access token: `Authorization: Bearer <jwt>`, 15 minutes.
- Refresh token: `httpOnly`, `SameSite=Lax` cookie; `Secure` in production.
- `refresh` and `logout` increment `tokenVersion`, so the presented refresh
  token and every older access token stop working (single-session rotation).
- Passwords are bcrypt cost 12 (4 in tests). Login returns one generic message
  for unknown email, wrong password, and inactive account.

## Route access

All routes are under `/api/v1`. **Auth** is the minimum role; ownership is
checked by the service.

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
| POST | `/questions/import` | teacher, admin | owns created rows |
| GET | `/questions/:id` | teacher, admin | owner or admin |
| PATCH | `/questions/:id` | teacher, admin | owner or admin |
| DELETE | `/questions/:id` | teacher, admin | owner or admin; archives if referenced |
| GET | `/exams` | teacher, admin | teacher sees own; admin sees all |
| POST | `/exams` | teacher, admin | may only reference own questions (admin: any) |
| GET | `/exams/available` | student | assigned batch or joined by code |
| POST | `/exams/join` | student | published + join-code enabled + not ended |
| GET | `/exams/:id` | any | owner/admin, or assigned student (metadata only) |
| PATCH | `/exams/:id` | teacher, admin | owner or admin; drafts only |
| POST | `/exams/:id/publish` | teacher, admin | owner or admin; needs items |
| POST | `/exams/:id/start` | student | assigned/joined, live window |
| GET | `/exams/:id/monitor` | teacher, admin | owner or admin |
| GET | `/exams/:id/results` | teacher, admin | owner or admin |
| GET | `/exams/:id/analytics` | teacher, admin | owner or admin |
| GET | `/exams/:id/results/export.csv` | teacher, admin | owner or admin |
| POST | `/exams/:id/release-results` | teacher, admin | owner or admin |
| GET | `/attempts/:id` | any | owning student, owning exam teacher, or admin |
| PATCH | `/attempts/:id/answer` | student | owning student |
| POST | `/attempts/:id/violation` | student | owning student |
| POST | `/attempts/:id/submit` | student | owning student |
| GET | `/attempts/:id/result` | any | owning student (released), owning exam teacher, or admin |

Unauthenticated requests get `401 UNAUTHORIZED` before any resource lookup, so
they never reveal whether an id exists.

## Attempt invariants

The repository contract (`src/repositories/interfaces.js`) has dedicated
atomic methods instead of generic updates:

- `createIfNoActive(examId, studentId, data, { maxAttempts })` — one active
  attempt; returns the existing attempt instead of creating a duplicate.
- `saveAnswerIfNewer(...)` — a delayed write with `clientSeq <= current` is
  rejected with `409 STALE_CLIENT_SEQ` and `details[0].currentSeq`.
- `finalizeIfInProgress(...)` — only the first `in_progress → submitted`
  transition wins; repeated submits return the original `submittedAt`.
- `findExpiredInProgress(now, limit)` — the cron sweep, 100 per minute.
- `publish(id, teacherId, prepared)` — status, item snapshots, total marks and
  join code change in one synchronous block.

The memory driver is atomic only within one Node process. The Mongo driver must
add a unique `(examId, studentId)` index and conditional updates/transactions;
the interface comments state this.

Grading is pure (`src/services/grading.js`): it receives the frozen question
set and answers, never HTTP or the clock. Multiple-choice partial marking uses
`marks * (correctPicks - wrongPicks) / correctCount`, clamped to `[0, marks]`;
with partial marking enabled, a negative-mark penalty is not applied to that
item.

The attempt workflow is also exposed through `src/services/examEngine.js` as a
stable service seam for start, resume, answer-save, violation, and submit
operations. Answer writes that arrive within five seconds after `expiresAt`
are accepted as in-flight delivery; later writes trigger lazy finalization.

## Mock vs server differences

The client MSW mock is the behavioural reference. Intentional differences:

- **Import size:** the mock caps at 5 MB; the server does the same
  (`IMPORT_MAX_BYTES`), so this matches.
- **Start time:** the contract says both times are future, but the mock only
  requires `endAt` to be future and `startAt < endAt`. The server follows the
  mock, which allows a teacher to create an exam that is already inside its
  live window.
- **`409 STALE_CLIENT_SEQ`:** not in the contract's error catalogue, but the
  client explicitly treats it as benign, so the server returns it for stale
  autosaves.
- **Passwords:** the mock stores a plain `password` field; the server stores
  only `passwordHash` and never returns it.
- **Platform stats:** the mock's admin dashboard reads `GET /users` and
  `GET /exams` metadata (`summary`), which the server implements. There is no
  separate stats endpoint because the contract defines none.
- **In-memory persistence:** the mock persists to `sessionStorage`; the server
  memory driver is per process and reseeded on start.

## Known limits (ponytail shortcuts)

- Only the memory driver exists; `REPOSITORY_DRIVER=mongo` throws at startup.
- Rate limits are skipped in `NODE_ENV=test`; one production-mode smoke test
  would be needed to exercise `429`.
- CSV export neutralises formula sigils but does not encode the file for Excel
  beyond UTF-8.
- The auto-submit cron uses the process clock; a multi-process deployment needs
  the Mongo `findExpiredInProgress` query to be the source of truth.
