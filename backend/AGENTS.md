# Database schema changes

The production database is the existing Baota MySQL database `couple`. Credentials belong only in the server's `/www/couple-app/shared/backend.env`; never commit them or user data.

Every change to `src/db/schema.ts` must include generated and reviewed SQL migrations and metadata in `drizzle/`. Run `npm run db:generate` when implementing the change, then `npm run db:check`, `npm run typecheck`, and appropriate tests. Never modify or remove already-published migrations; append a new migration instead.

Master deployments automatically back up and apply committed pending migrations before replacing the backend. Do not use `drizzle-kit push --force` or recreate databases in the deployment workflow. Table/column renames and data conversions need explicit migrations that preserve existing records. Prefer backward-compatible migrations because MySQL DDL is not automatically rolled back with application releases.

When delivering schema changes, complete migration generation and commit it as part of the feature; the user should not have to run SQL or generate migrations on the server.
