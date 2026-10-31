# ExamGuard — Complete UI Inventory

This document maps every screen, view mode, and interactive UI element in ExamGuard, including buttons, links, inputs, selects, toggles, keyboard shortcuts, timers, modals, and auto-triggered effects.

---

## 1. Global Shell & Navigation (`AppLayout.jsx`, `ThemeToggle.jsx`, `ConnectivityBanner.jsx`)

### 1.1 Desktop Sidebar (`lg:flex`)
- **Brand Link**
  - Label: `ExamGuard / Secure assessment`
  - Handler: `<NavLink to="/dashboard">`
  - API Call: None (client routing)
  - Success: Navigates to `/dashboard`
  - Failure: None
- **Navigation Links** (Dynamic by Role)
  - Admin: `Overview (/dashboard)`, `Users (/users)`
  - Teacher: `Overview (/dashboard)`, `Question bank (/questions)`, `Exams (/exams)`
  - Student: `My exams (/dashboard)`, `Explore exams (/exams/available)`, `Results (/results)`
  - Handler: `<NavLink to={link.to}>`
  - API Call: None
  - Success: Switches active route with styling indicator
  - Failure: None
- **Theme Toggle Button**
  - Label: `Light mode` / `Dark mode`
  - Handler: `toggle()` (updates `theme` state, toggles `dark` class on `<html>` and updates `localStorage`)
  - API Call: None
  - Success: Instant dark/light theme switch
  - Failure: None
- **Sign Out Button**
  - Label: `↩ Sign out`
  - Handler: `handleLogout()` -> `useAuthStore.logout()`
  - API Call: `POST /api/v1/auth/logout`
  - Success: Clears session state and tokens, redirects to `/login`
  - Failure: Clears local session in `finally`, redirects to `/login`

### 1.2 Mobile Navigation Header & Drawer (`lg:hidden`)
- **Mobile Menu Hamburger Button**
  - Label: `☰` (`aria-label="Open navigation"`)
  - Handler: `setMobileOpen(true)`
  - API Call: None
  - Success: Opens slide-out mobile drawer, locks body scroll
  - Failure: None
- **Mobile Drawer Close Button**
  - Label: `×` (`aria-label="Close navigation"`)
  - Handler: `setMobileOpen(false)`
  - API Call: None
  - Success: Closes drawer, restores body scroll
  - Failure: None
- **Backdrop Overlay Button**
  - Handler: `setMobileOpen(false)`
  - API Call: None
  - Success: Closes drawer on outside tap
  - Failure: None
- **Escape Key Listener**
  - Handler: Keydown event listener on `document`
  - Success: Closes drawer when Escape is pressed
  - Failure: None

### 1.3 Connectivity Banner
- **Offline Alert Banner**
  - Auto-triggered: When `navigator.onLine === false`
  - API Call: None
  - Success: Displays amber warning bar "You are offline. Answers stay on this screen..."
  - Failure: None

---

## 2. Authentication: Login Page (`LoginPage.jsx`)
- **Email Input**
  - Label: `Email address`
  - Handler: React Hook Form `register('email')`
  - Validation: Required, valid email format
- **Password Input & Show/Hide Toggle**
  - Label: `Password`
  - Handler: React Hook Form `register('password')`
  - Show/Hide Button: `setShowPassword((value) => !value)` toggles `type="text" | "password"`
- **Sign In Submit Button**
  - Label: `Sign in` / `Signing in…`
  - Handler: Form `onSubmit` -> `login({ email, password })`
  - API Call: `POST /api/v1/auth/login`
  - Success: Saves token in store, redirects to `location.state.from` or `/dashboard`
  - Failure: Sets field errors (e.g. `Email or password is incorrect`) or `serverError` banner
- **Create Account Link**
  - Label: `Create an account`
  - Handler: `<Link to="/register">`
  - Success: Navigates to `/register`

---

## 3. Authentication: Registration Page (`RegisterPage.jsx`)
- **Full Name Input**
  - Label: `Full name`
  - Handler: React Hook Form `register('name')`
  - Validation: 2–80 characters
- **Email Address Input**
  - Label: `Email address`
  - Handler: React Hook Form `register('email')`
  - Validation: Valid email format
- **Role Selector**
  - Label: `I am a`
  - Handler: React Hook Form `register('role')`
  - Options: `Student`, `Teacher`
- **Password & Confirm Password Inputs**
  - Label: `Password`, `Confirm password`
  - Handler: React Hook Form `register('password')`, `register('confirmPassword')`
  - Validation: $\ge 8$ chars, at least 1 letter, 1 number, matching confirm password
- **Create Account Submit Button**
  - Label: `Create account` / `Creating account…`
  - Handler: Form `onSubmit` -> `registerUser(values)`
  - API Call: `POST /api/v1/auth/register`
  - Success: Auto-authenticates, redirects to `/dashboard`
  - Failure: Displays field-level errors or duplicate email alert (`An account with this email already exists`)
- **Sign In Link**
  - Label: `Sign in`
  - Handler: `<Link to="/login">`
  - Success: Navigates to `/login`

---

## 4. Student Exams Panel (`StudentExamsPanel.jsx` & `AvailableExamsPage.jsx`)
- **Tab Filters**
  - Tabs: `All`, `Live`, `Upcoming`, `Past` with badge counters
  - Handler: `setTab(value)`
  - Success: Filters displayed exam cards locally
- **Join with Code Button**
  - Label: `Join with code`
  - Handler: `setJoinOpen(true)`
  - Success: Opens Modal dialog containing join form
- **Join Exam Modal Form**
  - Code Input: `maxLength={32}`, auto-uppercase formatting
  - Join Submit Button: `Join exam` / `Checking code…`
  - Handler: `POST /api/v1/exams/join`
  - Success: Invalidates `['student-exams']`, toasts success `Added “<Exam>”`, closes modal
  - Failure: Inline error (`Use 4–32 letters...`, `No exam matches...`, `Exam not live`)
- **Exam Card Action Buttons**
  - `Start exam` Link (when `availability === 'live' && canStart`): Navigates to `/exams/:examId/instructions`
  - `Resume attempt` Link (when `canResume`): Navigates to `/attempts/:attemptId`
  - `View result` Link (when `resultAvailable`): Navigates to `/attempts/:attemptId/result`
  - Live Window Closing Countdown: `LiveWindowCountdown` with ping pulse, triggers query invalidation on reaching zero
  - Upcoming Countdown: `UpcomingCountdown` with ping pulse, triggers query invalidation on reaching start time

---

## 5. Student Instructions Page (`StudentInstructionsPage.jsx`)
- **Back to Exams Link**
  - Label: `← Back to exams`
  - Handler: `<Link to="/dashboard">`
- **Agreement Checkbox**
  - Label: `I understand and agree to follow these examination rules.`
  - Handler: `setAgreed(event.target.checked)`
  - Success: Enables the Start button when exam is live
- **Start Exam Button**
  - Label: `Start exam now` / `Preparing your attempt…` / `Exam starts in: HH:MM:SS` (when upcoming)
  - Handler: `start.mutate()`
  - Fullscreen Gesture: Attempts `document.documentElement.requestFullscreen()`
  - API Call: `POST /api/v1/exams/:examId/start`
  - Success: Navigates to `/attempts/:attemptId` with `{ replace: true }`
  - Failure: If `ALREADY_ATTEMPTED`, redirects to `/results`; else displays toast error

---

## 6. Exam Attempt Screen (`AttemptPage.jsx`)
- **Top Bar Controls**
  - **Save Indicator & Retry Button**: `SaveIndicator` showing `Saved`, `Saving…`, or `Offline` with manual retry click `onRetry={autosave.flushNow}`
  - **Countdown Timer**: `AttemptTimer` showing remaining server-synchronized time; triggers `handleExpiry()` at zero
  - **Fullscreen Toggle Button**: `Fullscreen` (triggers `antiCheat.requestFullscreen()`)
  - **Save & Exit Button**: Triggers `saveAndExit()` -> flushes unsaved answers and navigates to `/dashboard`
  - **Review & Submit Button**: Opens Submit Confirmation Modal (`setConfirmSubmit(true)`)
  - **Progress Bar**: Dynamic fill percentage based on `answeredCount / questions.length`
- **Question Interaction**
  - **Single Choice Options**: Radio buttons triggering `chooseOption(optionId)` -> updates local store and enqueues autosave
  - **Multiple Choice Options**: Checkboxes toggling `optionId` in selection array
  - **Numeric Answer Input**: Number input with `debounce` saving float value
  - **Mark for Review Button**: Toggles review flag `toggleMark(currentItem.id)`
  - **Clear Response Button**: Clears current answer `clearAnswer(currentItem.id)`
- **Palette & Navigation**
  - **Previous Button**: Goes to `currentIndex - 1` (disabled on first question)
  - **Next Button**: Goes to `currentIndex + 1` (replaces with `Review & submit` on last question)
  - **Mobile Palette Button / Drawer**: Opens bottom sheet with grid of question numbers
  - **Desktop Palette Aside**: Interactive list of all question numbers with color-coded status (Answered, Unanswered, Marked, Current)
- **Keyboard Shortcuts**
  - `ArrowLeft` / `ArrowRight`: Navigate between questions
  - `1` through `6`: Select option A through F
  - `M`: Toggle Mark for Review
- **Submit Confirmation Modal**
  - Modal with Answered/Unanswered/Marked breakdown
  - `Keep working` Button: Closes modal
  - `Submit attempt` Button: Flushes queue and calls `POST /api/v1/attempts/:attemptId/submit`
- **Anti-Cheat Warning Modal**
  - Triggers on tab switch, window blur, or fullscreen exit
  - `Continue attempt` Button: Dismisses warning modal
- **Auto-Triggered Effects**
  - `useAutosave`: Debounced background PATCH to `/attempts/:attemptId/answer`
  - `useAntiCheat`: Tab visibility and blur listeners recording violations via POST to `/attempts/:attemptId/violation`
  - Expiry Listener: Auto-submits attempt when server deadline is reached

---

## 7. Student Results & Detail Pages (`StudentResultsPage.jsx` & `ResultDetailPage.jsx`)
- **Student Results Tabs**
  - `Available` vs `Pending release` tabs with count pills
  - `Open result` Link: Navigates to `/attempts/:attemptId/result`
- **Result Detail Screen**
  - Score, Percentage, Questions Correct, and Time Taken stat cards
  - Performance History Line Chart (`recharts` interactive line chart)
  - Question Breakdown Accordion/Cards: Question prompt, selected option vs correct option, awarded marks, and explanation

---

## 8. Teacher Dashboard & Exams List (`DashboardPage.jsx` & `ExamsPage.jsx`)
- **Quick Stat Cards**: `Live now`, `Upcoming`, `Ended`, `Drafts`
- **Search Input**: Debounced exam title filter
- **Status Filter**: Dropdown (`All`, `Draft`, `Published`)
- **Pagination Controls**: `Previous`, `Next`, and page number buttons
- **Exam Actions**:
  - `Overview` / `Continue editing` Link: Navigates to `/exams/:id` or `/exams/:id/edit`
  - `Monitor` Link: Navigates to `/exams/:id/monitor`
  - `Analytics` Link: Navigates to `/exams/:id/analytics`
  - `Delete` Button: Confirmation dialog + `DELETE /api/v1/exams/:id`

---

## 9. Exam Builder (`ExamBuilderPage.jsx`)
- **Step Navigation Tabs**: `1. Basic info`, `2. Questions`, `3. Settings & schedule`
- **Step 1: Basic Info**
  - Title input, Description textarea, Duration input
- **Step 2: Questions Selection & DnD Reorder**
  - Question Bank Search & Picker with `Add` buttons
  - Drag-and-drop handles for reordering exam questions (`@dnd-kit`)
  - Marks & Negative Marks numeric inputs per item
  - Remove Item Button per item
- **Step 3: Schedule & Settings**
  - Start datetime-local input, End datetime-local input
  - Result Mode select (`Immediate`, `After exam ends`, `Manual release`)
  - Pass percentage, violation limit, and numeric tolerance inputs
  - Batch assignment checkboxes (toggles batches)
  - Join code toggle checkbox
- **Action Buttons**:
  - `Back` and `Next` step buttons
  - `Save draft` Button: `POST /api/v1/exams` or `PATCH /api/v1/exams/:id`
  - `Publish exam` Button: Validates, saves, and executes `POST /api/v1/exams/:id/publish`

---

## 10. Exam Overview (`ExamOverviewPage.jsx`)
- **Header Actions**:
  - `Edit exam` Link (if draft)
  - `Publish exam` Button (if draft) -> triggers publish mutation
  - `Release results` Button (if published & unreleased) -> triggers `POST /api/v1/exams/:id/release-results`
  - `Delete exam` Button -> confirmation dialog + delete mutation
- **Join Code Copy Button**: One-click clipboard copy of exam join code
- **Quick Links**: Direct navigation to Live Monitor, Analytics, Results, and Question Bank

---

## 11. Teacher Live Monitor (`TeacherMonitorPage.jsx`)
- **Polling Indicator**: Pulse badge showing 10-second auto-refresh interval
- **Student Filter**: Search input by student name or email
- **Status Filter**: Dropdown (`All statuses`, `Not started`, `In progress`, `Submitted`)
- **Data Table**: Student name, email, attempt status, started/expiry timestamps, answer count, and violation events badge
- **Violation Breakdown**: Clickable detail popover showing exact proctoring incident types and timestamps

---

## 12. Results & Analytics Pages (`ResultsPage.jsx` & `AnalyticsPage.jsx`)
- **Results Screen**:
  - Search input by student
  - `Export CSV` Button: Downloads `results.csv` via blob URL
  - Student attempt table with marks, score percentage, pass/fail badge, and violation count
- **Analytics Screen**:
  - Metric summary cards (Submissions, Average score, Pass rate, Average duration)
  - Score distribution bar chart (10-point histogram bands)
  - Pass/Fail donut chart (`recharts`)
  - Question Performance Table: Attempted count, correct count, accuracy percentage, and average marks per question
  - Leaderboard Table: Top ranking students with rank, score, and submission timestamp

---

## 13. Admin User Management (`AdminUsersPage.jsx`)
- **Filter Controls**:
  - Search input (name or email)
  - Role dropdown (`All`, `Admin`, `Teacher`, `Student`)
  - Batch dropdown
  - Status dropdown (`Any`, `Active`, `Inactive`)
  - `Clear filters` Button
- **Data Table Actions**:
  - Role Select: Changes user role via `PATCH /api/v1/users/:id`
  - Active Switch Toggle: Instant account activation/deactivation switch
  - Delete User Button: Confirmation prompt + `DELETE /api/v1/users/:id`
- **Pagination Controls**: `Previous`, `Next`, and page numbers
