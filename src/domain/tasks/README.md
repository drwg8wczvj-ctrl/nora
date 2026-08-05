# Task domain

This directory is the authoritative home for task behavior.

- `taskSchema.ts`: runtime and TypeScript task contract
- `taskDates.ts`: local-calendar date operations
- `taskRecurrence.ts`: recurring occurrence rules
- `taskSelectors.ts`: repeat-aware queries and schedule context
- `taskMutations.ts`: immutable task collection operations
- `taskAiTools.ts`: validated AI task-command execution
- `useTaskDomain.ts`: compatibility state adapter for the current application

UI components should consume domain selectors and actions instead of adding new
task logic to `App.js` or `MobileApp.js`.

The compatibility hook intentionally retains the existing `tasks` array and
React setter contract. This lets collaboration, notifications, widgets, and
cloud snapshot sync migrate independently. Record-level persistence and
per-occurrence completion are deferred to the normalized data model phase.
# Task domain

Phase 3 adds normalized, record-level synchronization through
`planner_tasks`. The browser cache and legacy `user_app_data.tasks` snapshot
remain active during rollout, so an unavailable or not-yet-migrated database
falls back without blocking task editing.

Synchronization is local-first and uses `updatedAt` plus server revisions to
resolve concurrent edits. Deletes are soft deletes, and Supabase Realtime
propagates changes between signed-in devices.
