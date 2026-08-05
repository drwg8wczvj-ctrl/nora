# Production operations

## Deployment gate

Every deployment must pass:

```bash
npm ci
npm run verify
```

The GitHub Actions verification workflow runs the same gate for pull requests
and pushes to `main`. It includes types, lint, unit and integration tests, the
production build, and bundle budgets.

## Environment

Required server configuration:

- `SUPABASE_URL` or `VITE_SUPABASE_URL`
- `SUPABASE_ANON_KEY` or `VITE_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`

Legacy `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY` remain
accepted during migration, but new environments should use the names above.
Integration-specific secrets are required only when those integrations are
enabled.

## Health and readiness

`GET /api/health` returns `200` when core server configuration is present and
`503` when required configuration is missing. It never returns secret values.
`HEAD /api/health` provides the same status without a response body.

Check this endpoint after changing environment variables and after every
deployment:

```bash
curl --fail https://YOUR_DEPLOYMENT/api/health
```

## Database rollout

Apply ordered files from `supabase/migrations/` before deploying code that
requires them. Phase 3 task synchronization retains the legacy
`user_app_data.tasks` snapshot as a fallback. Do not remove the snapshot until
record synchronization has been stable across web and iOS releases.

## Rollback

Application deployments can be rolled back independently because the Phase 3
schema is additive. Do not drop `planner_tasks` during an application rollback.
Older clients continue using the legacy snapshot, while newer clients resume
record synchronization when redeployed.

## Bundle budgets

`npm run build:budget` checks the generated production assets. When it fails,
split a feature or heavy dependency instead of increasing the limit unless the
increase is reviewed and intentional.
