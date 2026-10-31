# ExamGuard frontend notes

React 18 client for ExamGuard, built against [`docs/API_CONTRACT.md`](./API_CONTRACT.md). The app ships with a stateful Mock Service Worker (MSW) API so every flow — auth, question bank, exam builder, attempt, grading, results, analytics, admin — can be exercised without the Express server.

## Quick start

```bash
npm install                 # from the repository root (workspaces)
npm run dev:client          # http://localhost:5173
```

The dev server starts MSW in the browser. If `client/public/mockServiceWorker.js` is ever missing, regenerate it with:

```bash
npx msw init client/public --save
```

Other commands:

```bash
npm run build --workspace client   # production build
npm test --workspace client        # Vitest + Testing Library
npm run preview --workspace client # serve dist/ (MSW still runs in the browser)
```

Environment variables (all optional):

| Variable | Default | Purpose |
| --- | --- | --- |
| `VITE_USE_MOCK` | enabled | Set to `false` to stop MSW and call a real API. |
| `VITE_API_URL` | `/api/v1` | Base URL for Axios. |

## Account provisioning

No demo accounts or demo content are enabled for the deployed client. Administrators
must provision users through the server tools or the admin panel.

## Architecture

```
client/src
├─ api/client.js          Axios instance, single-flight refresh, clock sync
├─ components/            Layout, routes, guards, UI primitives, states, panels
├─ hooks/                 Clock, countdown, autosave, anti-cheat, online, debounce, copy
├─ mocks/                 MSW handlers, seeded state, grading, validation, importer, DevTools
├─ pages/                 Route-level screens (all lazy-loaded except guards)
├─ store/                 Zustand stores: auth, attempt, clock, theme
├─ tests/                 Vitest setup + hook/component/contract tests
└─ utils/                 cn, formatting, error normalisation, constants
```

### Routing

- Public: `/login`, `/register` (redirected to `/dashboard` when already signed in).
- Shared: `/dashboard`; `/attempts/:attemptId` renders the distraction-free exam shell without the app sidebar.
- Teacher/admin: `/questions`, `/exams`, `/exams/new`, `/exams/:examId/edit`, `/exams/:examId`, monitor, results, analytics.
- Student: `/exams/available`, `/exams/:examId/instructions`, `/results`, `/attempts/:attemptId/result`.
- Admin: `/users`.
- Unknown paths render a 404 with a route home.

Every page is `React.lazy`-loaded through `components/AppRoutes.jsx`; the fallback is a skeleton with `aria-busy`.

### Server state

TanStack Query owns all remote data. Representative keys:

| Key | Used by |
| --- | --- |
| `['student-exams', ...]` | Student dashboard, available exams, result list |
| `['questions', filters]` | Question bank, exam builder picker |
| `['exams', filters]` | Teacher exam list, batch options |
| `['exam', examId]` | Overview and draft editor |
| `['attempt', attemptId]` | Exam screen |
| `['result', attemptId]` | Result detail |
| `['monitor', examId, filters]` | Live monitor (10s polling) |
| `['results', examId, filters]` | Teacher results table |
| `['analytics', examId]` | Charts |
| `['admin-users', filters]` | Admin table |

Mutations invalidate the relevant prefixes, so publishing, saving a draft, toggling a user, or submitting an attempt updates every dependent screen.

### Client state

- `authStore` — user, access token (memory only), bootstrap/refresh/logout. Access tokens are never written to Web Storage.
- `attemptStore` — hydrated answers, current question, mark/clear helpers. Reset on submit and on route change.
- `clockStore` — server clock offset. Every response carrying `serverTime` updates it.
- `themeStore` — one light/dark source shared by desktop and mobile toggles; persisted in `localStorage`.

## Server-authoritative time

- `useClockStore.now()` = device time + offset learned from `serverTime`.
- `useCountdown(expiresAt)` ticks once per second and fires `onExpire` exactly once. Warnings are coarse (`5 minutes`, `1 minute`), so an `aria-live` region does not announce every tick.
- `AttemptTimer` is its own component. The 1s tick re-renders the timer and warning text, not the question card or palette.
- The client never decides that an attempt has expired. On expiry it attempts a submit; if the server says the attempt is already finalized, the submitted screen is shown. `409 ATTEMPT_EXPIRED` from an answer save is treated the same way.
- Submitting is idempotent and absorbs expiry: an expired in-progress attempt is finalized by the server and the same submitted summary is returned.

## Autosave protocol

`hooks/useAutosave.js` implements an ordered, per-item write queue:

1. A change debounces for ~450 ms, then enters the queue.
2. Each write carries a monotonically increasing `clientSeq`, seeded from the highest `clientSeq` in `savedAnswers` after a reload.
3. Writes for the same item coalesce; the newest state wins, but ordering is preserved.
4. Failures retry with exponential backoff plus jitter. `409 STALE_CLIENT_SEQ` is treated as “a newer write already won”, not a hard failure.
5. `flushNow()` drains the queue before submit or “Save & exit”.
6. The indicator reports `saved`, `saving`, `offline`, or `error`; an error offers a manual retry.

The queue is intentionally in-memory. A hard refresh discards only writes that never reached the server; the attempt screen refetches `savedAnswers` and resumes from there.

## Exam integrity

- Signals recorded: tab hidden, window blur, fullscreen exit, copy, paste, and a generic fallback.
- Violations are sent to `POST /attempts/:id/violation`; the API is authoritative for the count and limit.
- A modal warns on each signal. Reaching the configured limit auto-submits when the exam policy enables it.
- Fullscreen is requested from the instructions screen while the click is still a user gesture. The exam screen offers a manual “Fullscreen” button if the browser denied the initial request.
- Keyboard: `←`/`→` navigate, `1`–`6` choose options, `M` marks for review. Shortcuts are suppressed while typing, in dialogs, or when a violation warning is open.
- Copy/paste outside inputs is recorded. The app does not try to defeat devtools or OS-level shortcuts; the contract treats signals as an audit trail, not a security boundary.
- Refreshing resumes the same attempt because attempt identity lives on the server. Before unload prompts while an attempt is active.

## Result release

Result modes are `immediate`, `after_end`, and `manual`.

- Student-facing exam metadata carries `resultAvailable`, `score`, `percentage`, `passed`, and `policy`.
- `GET /attempts/:id/result` returns `403 RESULT_NOT_AVAILABLE` until release; the result page renders a sealed-result screen with the expected time when supplied.
- Teachers can always see submitted results and analytics for their own exams. “Release results now” sets `resultsReleasedAt`.
- The student result list is derived from `GET /exams/available?scope=all` (submitted attempts with an `attemptId`). There is no dedicated result-list endpoint in v1.1.
- Answer keys and explanations exist only in the released result payload and in teacher question/snapshot data.

## Stateful mock server

The mock is a real state machine, not canned fixtures:

- Seeded users/questions/exams are deterministic; `sessionStorage` key `examguard-mock-state-v1` survives hard refresh in the same tab.
- Every non-auth endpoint adds 100–400 ms of latency and a ~2% transient `503`. Auth endpoints skip the random failure so boot/login stays reliable.
- Attempt rules are enforced server-side: eligibility, live window, one attempt per student, shuffle-once question set, answer-key stripping, `clientSeq` monotonicity, lazy expiry, idempotent submit, grading, and release policy.
- Teacher ownership is enforced for questions, exams, monitoring, results, analytics, release, and export.
- Admin can toggle users/roles but cannot demote or deactivate their own account.
- CSV/XLSX import uses `xlsx` and reports per-row failures.

### Mock DevTools

The floating panel (`client/src/mocks/DevToolsPanel.jsx`) exposes:

| Control | What to verify |
| --- | --- |
| Make my attempt expire in 20s | Countdown turns critical, then auto-submit; the submitted screen appears. |
| Fail next save | Save indicator shows failure/retry; the next attempt succeeds. |
| Go offline | Banner appears, saves queue, then drain when back online. |
| Skew server clock by +2 min | Countdown drops by two minutes without a page reload. |
| Reset data | Seed data is restored and the page reloads. |

## Manual verification runbook

### 1. Auth, shell, theme

1. Open `/dashboard` signed out → redirected to `/login`.
2. Fill the Student demo card, sign in → student dashboard.
3. Toggle dark mode from the mobile header and desktop sidebar; both stay in sync after navigation and reload.
4. Resize to 375 px: sidebar becomes a drawer, focus is trapped, Escape closes it, background scroll is locked.
5. Sign out → `/login`; browser back does not restore the protected page.

### 2. Student attempt

1. Sign in as a provisioned student account.
2. Open an assigned live exam → instructions show system check, policy, and window.
3. Tick the agreement and start (allow fullscreen).
4. Answer a choice question, a numeric question, mark one for review, navigate with the palette and arrow keys.
5. Confirm the save indicator reaches “All changes saved”.
6. Use DevTools → **Fail next save**, change an answer, confirm the error/retry path.
7. Use DevTools → **Go offline**, answer another question, confirm the offline banner and queued count; go online and confirm the queue drains.
8. Refresh mid-attempt → the same attempt resumes with previous answers and violation count.
9. Switch tabs → violation modal/count increments; check the teacher monitor reflects it.
10. Submit → confirmation shows answered/unanswered/marked; submitted screen shows release status.
11. While results are sealed, open the result URL → sealed-result screen, not an error or answer key.

### 3. Teacher authoring and reporting

1. Sign in as a provisioned teacher account.
2. Question bank: search, filter by subject/difficulty/type, create a single-choice question, edit it, delete it.
3. Import: download the CSV template, import it, check created/failed counts.
4. Build an exam: five steps, drag to reorder with mouse and keyboard, edit per-item marks/negative marks, choose batches, save draft.
5. Publish from the overview or builder → join code appears; published exams allow schedule-only edits.
6. Monitor: counts, search, status filter, auto-refresh timestamp.
7. Results: search, pass rate, export CSV, open the file and confirm columns.
8. Analytics: distribution, pass/fail, item difficulty, leaderboard, average times.
9. Release results manually from the overview and verify the student sees them.

### 4. Admin

1. Sign in with the private administrator account created by the deployment owner.
2. `/users`: search, filter by role/batch/status, change a role, toggle active/inactive.
3. Confirm you cannot deactivate or demote yourself.
4. Dashboard stats and newest accounts match the table.

### 5. Failure and edge cases

- Empty lists render an empty state with a action; API failures render an error with **Retry**.
- A student cannot open another student's attempt URL (`403`).
- A teacher cannot manage another teacher's exam.
- An expired attempt cannot accept answers; the screen moves to submitted.
- A second submit returns the same `submittedAt` and does not regrade.
- Join code is case-insensitive and rejects invalid/ended exams.

## Automated checks

```bash
npm test --workspace client
npm run build --workspace client
```

Covered by tests:

- `grading.test.js` — exact option sets, negative marks, numeric grading, score floor.
- `useCountdown.test.jsx` — server-offset countdown, one-shot expiry, warning thresholds.
- `useAutosave.test.jsx` — queue writes with a sequence newer than the server's last accepted write.
- `QuestionPalette.test.jsx` — accessible labels, current question, numeric zero treated as answered.
- `mockApi.test.js` — end-to-end mock lifecycle: create question/exam, publish, start, answer-key stripping, stale sequence rejection, idempotent submit, released result, cross-student access denial.

The production build splits routes and vendors:

| Chunk | Approx. gzip |
| --- | --- |
| `index` (app shell) | ~124 kB |
| `react-vendor` | ~52 kB |
| `charts` | ~114 kB |
| `spreadsheet` (xlsx) | ~143 kB |
| `browser` (MSW) | ~27 kB |
| `forms`, `query-vendor`, `dnd-vendor` | 15–27 kB each |
| Page chunks | 0.3–8 kB each |

## Accessibility checklist

Verified in code / manual pass:

- [x] One `<main>` landmark per screen; skip link targets `#main-content`.
- [x] Every input has a label; errors are referenced by helper text and exposed as text.
- [x] Buttons use real `<button>` elements; links remain links.
- [x] Dialogs: `role="dialog"`, `aria-modal`, labelled by a unique title id, focus trap, Escape close, focus restoration, background scroll lock.
- [x] Tabs use `role="tablist"`/`role="tab"` with `aria-selected`.
- [x] Mobile drawer: `aria-expanded`, Escape close, focusable backdrop button, scroll lock.
- [x] Palette cells have descriptive `aria-label` including answered/marked state and `aria-current="step"`.
- [x] Timer has an accessible label and a polite live region for coarse warnings.
- [x] Offline banner and save failures use `role="status"`/`role="alert"`.
- [x] Toggles expose `role="switch"` + `aria-checked`.
- [x] Touch targets are at least 40–44 px; focus rings are visible in both themes.
- [x] `prefers-reduced-motion` disables non-essential animation in `styles.css`.
- [x] Charts have text equivalents (stat cards, item rows, leaderboard) so data is not colour-only.
- [ ] Route changes do not yet update `document.title`; add a title hook if the product needs it.

Suggested Lighthouse pass (production build, incognito, MSW enabled):

```bash
npm run build --workspace client
npm run preview --workspace client
```

1. Run Lighthouse → Accessibility; target ≥ 95.
2. Tab through login, builder, attempt, and modals; no focus traps besides open dialogs.
3. Zoom to 200% at 375 px; no horizontal scrolling except data tables/tabs (their own scroll containers).
4. Check contrast for slate body text on white and on `slate-950`; amber/red alerts remain readable in dark mode.
5. Performance: page chunks are lazy, but MSW + charts make the demo heavier than the real API build. Re-measure with `VITE_USE_MOCK=false`.

## Known limitations

- The mock lives in the browser. Anyone can read its seed bundle; the real API must remain the only source of answer keys.
- Mock persistence is per-tab `sessionStorage`, not a database. “Reset data” restores seeds.
- Unsynced autosave writes are in memory; a hard refresh while offline loses them. The UI warns before unload but cannot flush without a connection.
- The student result list is derived from `/exams/available`; a dedicated endpoint would be cleaner once the real API exists.
- No i18n, no PWA/offline shell, no server-rendered pages.
- Fullscreen, clipboard, and visibility APIs vary by browser and cannot be fully enforced.
