# Supabase migration policy

`supabase/migrations/` is the only authoritative, ordered migration history for
new and existing environments.

The SQL files at the repository root are historical bootstrap snapshots:

- `supabase_migrations.sql`
- `supabase_full_migration.sql`
- `supabase_profiles.sql`
- `supabase_collaboration.sql`

Do not apply those snapshots after the ordered migrations and do not add new
schema changes to them. They are retained temporarily for production-history
comparison and will be removed after every deployed environment has been
reconciled.

## Applying changes

1. Back up the target database.
2. Confirm which migrations are already recorded in the target environment.
3. Review the next migration and apply it through the normal Supabase migration
   workflow.
4. Verify tables, functions, grants, RLS state, and application health.
5. Deploy application code only after required database migrations succeed.

## Phase 0 deployment order

1. Apply `20260805_phase0_api_rate_limits.sql`.
2. Confirm `service_role` can execute `consume_api_rate_limit`.
3. Confirm `anon` and `authenticated` cannot execute it directly.
4. Deploy the Vercel API and web client together.
5. Verify unauthenticated API requests return `401`.
6. Verify authenticated chat, tips, intelligence sync, and checkout requests do
   not return `503`.

The API deliberately fails closed if the rate-limit storage is unavailable.
