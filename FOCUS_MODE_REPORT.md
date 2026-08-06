# Focus Mode: Current-State Product and Technical Report

**Snapshot date:** 6 August 2026  
**Scope:** The current workspace implementation, with emphasis on `src/FocusSession.js` and its desktop, mobile, AI, notification, persistence, and status-engine integrations.

## Technical summary

The product currently has two separate concepts called “Focus Mode”:

1. **Focus Session** is the actual user-facing workflow: a task-bound modal with a configurable countdown, task-specific first-step coaching, optional music links, pause/distraction recovery, a five-minute break, completion messaging, notifications, and locally accumulated focus statistics.
2. **Focus Mode** is also the Status engine's neutral fallback state. It appears when none of Recovery Day, High Load, Peak Focus, Building Momentum, or Steady Flow applies. It does not reflect whether a Focus Session is open or running.

The Focus Session experience is available on desktop and mobile and is centered on reducing activation friction, rather than merely displaying a Pomodoro timer. The key product idea is: choose one existing task, shrink it to a concrete first action, run a bounded session, recover without guilt when distracted, and turn accumulated session history into status metrics and observations.

The implementation is functional but not durable as a timer. Session state exists only inside the mounted React component. Reloading, closing the modal, navigating away, or suspending the web runtime can lose or distort an active session. There is no operating-system distraction blocking, no session restore, no abandoned-session event, and no dedicated Focus Session test suite.

## 1. Entry points and availability

Focus Session is task-oriented; there is no independent focus dashboard or general “start an untitled session” entry point in normal navigation.

On desktop, an incomplete task can open Focus Session from:

- the schedule card action labeled **Focus**;
- the timeline's lightning-button action;
- the task list action labeled **Focus**.

On mobile, it can open from:

- an expanded incomplete task's **Focus** action;
- the planner's recommended-task **Start focus** button;
- the native task action menu's `focus` action.

Both desktop and mobile set a shared `focusTask` state to the selected task and render the same `FocusSession` component as an overlay. Completing from the overlay toggles that task complete and closes the overlay. Choosing reschedule closes Focus Session and opens the existing reschedule UI for the same task.

Focus actions are generally restricted to ordinary, incomplete tasks. Breaks and deadlines use other actions. The component itself tolerates a missing task and falls back to “Focus Session,” but the normal entry points always provide a task.

## 2. User journey and state machine

The component has seven UI phases:

`check → prepare → running ⇄ paused → completed`

with two recovery branches:

`running → distracted → running | prepare | break | reschedule`

and:

`break → prepare` when the break expires, or `break → running` when the user returns early.

### 2.1 Friction check for deferred tasks

If the task's date is at least two calendar days before today, the session opens with **“What's getting in the way?”** instead of the normal preparation screen. The available reasons are:

| Reason | Resulting approach |
|---|---|
| Too hard | Show the smallest task-specific first step |
| Too boring | Frame the first step as a quick sprint |
| Too unclear | Ask for a more explicit “step one” |
| Too tired | Reduce the ask to opening and looking at the work |
| No motivation | Connect completion to forward movement and ask for five minutes |

The user can skip the check. Selecting a reason records a `block_reason` event and moves to preparation.

The overdue calculation uses ISO dates derived from the client clock. “Two days” is therefore a date-based threshold, not an elapsed 48-hour threshold.

### 2.2 Preparation

Preparation shows:

- the task title;
- a **Start here** micro-step inferred from keywords in the title;
- duration choices of **15, 25, 45, or 60 minutes**;
- four music choices;
- a primary start button.

If the task has a duration, the initially selected focus duration is the closest supported option. Ties resolve toward the earlier value encountered in `[15, 25, 45, 60]`; otherwise the default is 25 minutes.

Micro-steps are deterministic keyword rules:

- reading/studying/learning/reviewing;
- writing/essay/report/draft;
- coding/building/implementing/fixing/debugging;
- email/message/call/reply;
- cleaning/tidying/organizing;
- a generic five-minute fallback for everything else.

An authenticated request is also made to `/api/tips` with type `focus_start`. The server asks `gpt-4.1-mini` for one task-specific starting tip of at most 15 words. If the request fails or returns no tip, the local first-step experience still works. The request is attempted only once per mounted Focus Session.

### 2.3 Music

The options are **Deep Focus**, **Calm Study**, **Light Focus**, and **No Music**. The first three do not play audio inside the application; they reveal an **Open playlist** link that opens a YouTube search in a new tab. “No Music” has no URL. Clicking an already-selected music option deselects it.

Music selection is not persisted, not logged, and does not control the timer. The application does not know whether the external playlist was actually used.

### 2.4 Running and paused

Starting creates a one-second interval, initializes the remaining seconds, records the wall-clock start in a ref, changes the phase to `running`, and appends a `started` event.

The active view contains:

- a circular progress ring;
- an `MM:SS` countdown;
- the task title;
- the first local micro-step;
- **Pause**, **I got distracted**, and **Finish** actions.

Pause stops the interval and changes the phase to `paused`. Resume starts the interval again from the current `timeLeft`.

Manual **Finish** and natural countdown expiry both enter the same completed phase. Neither automatically marks the task complete; that remains a separate explicit action on the completion screen.

### 2.5 Distraction recovery

**I got distracted** pauses the timer, increments the distraction counter, records a `distracted` event, and shows four non-judgmental choices:

- restart for five minutes;
- return to preparation and simplify the task;
- close Focus Session and open rescheduling;
- start a five-minute break.

The five-minute restart is a fresh countdown, not the remainder of the original session. It also records another `started` event.

The break is exactly five minutes. If it expires, the UI returns to preparation and may notify the user. If the user presses **I'm back — start session**, a new session starts immediately using the currently selected standard duration, not the interrupted remainder.

### 2.6 Completion

Completion triggers three separate outcomes:

1. A `completed` event is written and cumulative focus statistics are recomputed.
2. An AI completion reaction is requested from `/api/tips` using the task title, planned duration, and current distraction count.
3. The UI offers **Mark task done** or **Return to schedule**.

Until the AI response arrives, local copy distinguishes zero, one, or multiple distractions and emphasizes recovery rather than failure. If the request succeeds, the AI sentence replaces that local completion sentence.

**Mark task done** calls the application's existing task toggle and closes the overlay. **Return to schedule** closes it without changing the task.

## 3. Data, persistence, and derived intelligence

### 3.1 Local event log

Focus events are stored in browser/local WebView storage under `nora_focus_log`. Each event receives a millisecond timestamp. The log is capped to the newest 500 events.

Event shapes currently include:

- `started`: task ID, task title, selected duration;
- `distracted`: task ID;
- `block_reason`: task ID and reason key;
- `completed`: task ID, task title, planned duration, calculated actual minutes, and distraction count.

Storage and JSON errors are swallowed. There is no schema/version field, migration, user identifier, device identifier, timezone, or explicit session ID linking starts, distractions, and completion. There is also no `paused`, `resumed`, `break_started`, `abandoned`, or `task_marked_done` event.

### 3.2 Cumulative focus statistics

On every transition into `completed`, the component scans the retained log and calculates:

- sessions started;
- sessions completed;
- average actual focus duration;
- most frequent block reason;
- average distraction events per completed session.

These are written to `userPrefs.focus_stats`, updated in application state, and upserted to the authenticated user's `user_preferences` record in Supabase. The raw log remains local; only the aggregate preference object is synced through this path.

The write is fire-and-forget. Failure is not shown to the user. Concurrent preference updates are not merged server-side by this function; the entire current preferences object is upserted.

### 3.3 Status metrics

The Status engine consumes `userPrefs.focus_stats` in two metrics:

- **Deep Work Capacity:** after at least three completed sessions, completion rate can raise or lower the score, while average distractions apply a penalty. Before three completions, the metric relies on energy, workload, recovery, and optional health signals and is marked less confident.
- **Attention Stability:** gated until three completions, then calculated as completion rate minus a distraction penalty. Values map to high, moderate, or low buckets.

The local raw session log also feeds Nora observations. Once enough completed history exists, it can produce cumulative focus-investment milestones; the first shown threshold is 600 total logged minutes.

The code explicitly notes that it cannot yet identify when attention fragmentation began, because it does not maintain the required per-day history.

## 4. Notifications

Focus notifications are controlled by the existing **Focus sessions** notification setting, described as “When a session or break ends.” The category defaults to enabled, but notifications still depend on the application's master notification enablement and permission behavior.

When a focus countdown expires, the component requests a completion notification. When a break expires, it requests a break-over notification. Notification tags include the task ID. Pausing, manual finishing, closing, distraction, and rescheduling do not generate Focus Session notifications.

These are emitted when the component's JavaScript timer detects expiry. Focus Session does not schedule a durable operating-system alarm at session start, so reliability while the runtime is suspended is limited by the platform's treatment of the app/WebView.

## 5. AI behavior and failure handling

The client makes two optional tip calls:

- `focus_start` during preparation;
- `focus_complete` on completion.

The endpoint requires an authenticated user, applies the shared `tips` rate limit, validates the request type, requires `OPENAI_API_KEY`, and calls OpenAI's chat-completions endpoint with `gpt-4.1-mini` at temperature `0.75`.

Client failures are intentionally silent. Local deterministic micro-steps and completion copy are the fallback, so the core timer remains usable without the AI response.

There are two timing details worth noting:

- The start tip's request context is captured only on the first preparation phase. Later changes to duration, or a later return to preparation after distraction, do not trigger a refreshed tip.
- The completion prompt receives the selected/planned duration, not measured active-focus time.

## 6. UI, responsive behavior, and accessibility

The feature is a centered modal sheet over a dark backdrop, up to 440 px wide and 700 px/90 vh tall. It uses the shared native UI tokens, responds to dark mode, scrolls internally, and reduces dimensions/reflows grids below 480 px. It uses the same component on desktop and mobile.

Implemented accessibility affordances include:

- `role="dialog"` and `aria-modal="true"`;
- a dialog label of “Focus session”;
- a labeled close button;
- Escape-to-close;
- large, mostly 44–48 px controls;
- text labels accompanying icons.

Current accessibility gaps include:

- focus is not moved into the dialog on open or restored on close;
- keyboard focus is not trapped inside the modal;
- the backdrop is a clickable `div`, though a separate close button exists;
- timer and phase changes are not announced through an ARIA live region;
- no reduced-motion rule disables the entry animation or ring transition;
- the progress ring is hidden from assistive technology and has no semantic progress-bar equivalent.

## 7. Important as-is behaviors and defects

### High impact

1. **The timer is not durable.** `timeLeft`, `phase`, and start time are component-local. Reloading or unmounting loses the session, and reopening starts over.
2. **Elapsed time is interval-based.** The countdown decrements once per JavaScript tick rather than deriving remaining time from a target timestamp. Background throttling or suspension can make it late.
3. **Closing is unconditional.** Escape, backdrop click, or the close button immediately discards the active UI without warning, persistence, or an abandoned-session event.
4. **“Actual focus duration” is wall-clock duration.** It is computed from the latest `startFocus` call to completion, so time spent paused is included. It is rounded to whole minutes and can be zero for a short manually finished session.

### Data-quality issues

5. **The five-minute restart double-counts the UI distraction total.** Entering the distracted screen increments once; choosing “Restart — just 5 minutes” increments it again. Only one `distracted` event is logged, so the completion event's `distractionCount` can disagree with the aggregate calculation.
6. **Starts are not sessions.** Every restart and post-break start adds a `started` event, while a final completion adds one `completed` event. Completion rate therefore measures starts-to-completions, not clearly bounded user sessions.
7. **Retained aggregates can drift.** Focus statistics are recomputed from only the newest 500 events, so lifetime counts and averages can fall as old events roll off.
8. **No cross-device raw history.** Aggregates sync in preferences, but the event log used for observations remains local to a browser/WebView.
9. **No session identifiers.** Events cannot be reliably grouped into one session, especially across restart, pause, and break paths.

### Product/implementation inconsistencies

10. **The active screen ignores the selected friction framing.** Preparation adapts “Start here,” but the running screen always displays the first generic title-keyword micro-step.
11. **The component duplicates micro-step rules.** `statusEngine/interpretations.js` exports a supposedly canonical `getMicroStart`, but `FocusSession.js` contains its own copy, allowing future drift.
12. **Music is a search shortcut, not an integrated focus player.** No audio, playback state, or session association exists inside Nora.
13. **Distraction blocking is only a comment placeholder.** No sites, apps, or notifications are actually blocked.
14. **Break is recovery-only.** There is no normal post-completion “take a break” flow or automatic work/break cycle.
15. **No dedicated tests cover Focus Session.** Existing tests mock or reach the entry state, but there is no direct test of phase transitions, timing, logging, notifications, AI fallback, rescheduling, or completion.

## 8. The separate Status-engine “Focus Mode”

Status computes a single Nora state with this precedence:

1. Recovery Day;
2. High Load;
3. Peak Focus;
4. Building Momentum;
5. Steady Flow;
6. Focus Mode as the fallback.

The fallback is labeled **Focus Mode**, uses the accent color, and has medium confidence. Its coaching headline is deterministically selected from either “Focus Mode is active — pick one task and give it your full attention” or “This is a good moment to narrow in on a single priority.” In the AI system context it is described as “Standard mode. Be practical and light on structure.”

This state is not set by `focusTask`, the Focus Session phase, or `nora_focus_log`. A user can therefore see Status “Focus Mode” without having started a timer, and can run a Focus Session while Status displays another state. The shared naming currently communicates a relationship that the implementation does not have.

## 9. Current architecture

| Layer | Current responsibility |
|---|---|
| `FocusSession.js` | Entire phase state machine, countdown, local rules, event logging, aggregate calculation, AI calls, and completion UI |
| `FocusSession.css` | Modal, responsive layout, timer ring, phase and action styling |
| `App.js` | Desktop entry points, selected task state, overlay mount, task completion/reschedule handoff |
| `MobileApp.js` | Mobile entry points and the same completion/reschedule handoff |
| `api/tips.js` | Authenticated AI start and completion copy |
| `useNotifications.js` / notification settings | Permission/settings layer and notification delivery callback |
| `noraApi.js` | Whole-object persistence of aggregate focus statistics in user preferences |
| `statusEngine/metrics.js` | Deep Work Capacity and Attention Stability calculations |
| `noraObservations.js` | Reads the local raw log and produces longer-term focus observations |
| `useStatusEngine.js` / `interpretations.js` | Separate fallback status named Focus Mode and its coaching language |

The feature is currently monolithic at the component level. Timer mechanics, event schema, aggregation, and UI transitions are not extracted into independently testable hooks or domain modules.

## 10. Bottom line

As implemented today, Focus Session is best understood as a compassionate, task-specific focus coach wrapped around a lightweight in-app countdown. Its strongest differentiators are the overdue-task friction check, deterministic “smallest next step,” explicit distraction recovery, and downstream use of focus history in Nora's metrics.

It should not yet be described as a persistent timer, an app/site blocker, a full Pomodoro system, a cross-device focus history, or a status mode that activates while focusing. Those capabilities are either absent, only partially represented, or—distraction blocking in particular—explicitly left as future architecture.

## Source inventory

Primary inspected sources:

- `src/FocusSession.js`
- `src/FocusSession.css`
- `src/App.js`
- `src/MobileApp.js`
- `api/tips.js`
- `api/_validation.js`
- `src/hooks/useNotifications.js`
- `src/components/NotificationSettings.js`
- `src/lib/noraApi.js`
- `src/lib/noraObservations.js`
- `src/statusEngine/metrics.js`
- `src/statusEngine/useStatusEngine.js`
- `src/statusEngine/interpretations.js`

This report is based on static inspection of the current working tree. The tree already contained uncommitted Focus Session and related changes; no attempt was made to reinterpret the report as a description of the last Git commit. No application code was changed for this review.
