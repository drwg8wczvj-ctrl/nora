# Nora

Nora is a personal planning application for web and iOS. It combines task and
note management, AI planning, collaboration, wellbeing insights, notifications,
external-message intelligence, and native widgets.

## Technology

- React 19, TypeScript, Vite, and Capacitor
- Supabase Auth, PostgreSQL, Realtime, Storage, and Edge Functions
- Vercel serverless API routes
- Swift native plugins, HealthKit integration, and WidgetKit extensions

## Local development

Requirements:

- Node.js supported by the installed dependencies
- A Supabase project with the repository migrations applied
- Environment variables in `.env.local`

```bash
npm install
npm start
```

The web application runs at `http://localhost:3000`.

## Required environment variables

Client:

```text
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
```

Server:

```text
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
APP_URL
```

Feature-specific integrations additionally require the Stripe, Google,
Telegram, APNs, and web-push variables referenced by their API routes.

`OAUTH_STATE_SECRET` is recommended for signing Gmail OAuth state. When it is
not set, `GOOGLE_CLIENT_SECRET` is used.

Never expose `SUPABASE_SERVICE_ROLE_KEY`, OAuth client secrets, Stripe secrets,
or messaging sessions through `VITE_*` or `REACT_APP_*` variables.

## Database migrations

The authoritative migration history is the ordered SQL in
[`supabase/migrations`](supabase/migrations). See
[`supabase/MIGRATIONS.md`](supabase/MIGRATIONS.md) before provisioning or
updating an environment.

The Phase 0 API deployment requires
`20260805_phase0_api_rate_limits.sql` to be applied first. Authenticated API
routes fail closed when the rate-limit function is unavailable.

## Verification

```bash
npm run test:unit
npm run test:integration
npm run typecheck
npm run lint
npm run build
```

Run all local, credential-free checks with `npm run verify`. Playwright remains
the authenticated end-to-end layer under `qa/`.

Deployment health checks, required server configuration, CI behavior, and
rollback guidance are documented in [`OPERATIONS.md`](OPERATIONS.md).

Supabase types are checked in at `src/types/database.generated.ts`. After a
schema migration, set `SUPABASE_PROJECT_ID` locally and run `npm run db:types`.

End-to-end tests require a dedicated Supabase test account. Setup and commands
are documented in [`qa/README.md`](qa/README.md).

## Native iOS

The Capacitor application and WidgetKit targets live under `ios/App`. Native
source setup notes are available in [`ios-sources/SETUP.md`](ios-sources/SETUP.md).
