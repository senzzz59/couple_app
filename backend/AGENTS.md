# Database schema changes

The production database is the existing Baota MySQL database `couple`. Credentials belong only in the server's `/www/couple-app/shared/backend.env`; never commit them or user data.

The user's server runs MySQL 5.7.44. Keep generated SQL compatible with 5.7.44 and MySQL 8: JSON columns must use application `$defaultFn` values, and timestamps must use explicit `sql\`CURRENT_TIMESTAMP\`` instead of `.defaultNow()` (which generates a parenthesized expression). Do not introduce MySQL 8-only SQL. Preserve the hash-scoped historical compatibility adapter in `src/db/mysqlCompatibility.ts`; new migrations must work without adaptation.

Every change to `src/db/schema.ts` must include generated and reviewed SQL migrations and metadata in `drizzle/`. Run `npm run db:generate` when implementing the change, then `npm run db:check`, `npm run typecheck`, and appropriate tests. Never modify or remove already-published migrations; append a new migration instead.

Master deployments automatically back up and apply committed pending migrations before replacing the backend. Do not use `drizzle-kit push --force` or recreate databases in the deployment workflow. Table/column renames and data conversions need explicit migrations that preserve existing records. Prefer backward-compatible migrations because MySQL DDL is not automatically rolled back with application releases.

When delivering schema changes, complete migration generation and commit it as part of the feature; the user should not have to run SQL or generate migrations on the server.

# Stored files

Uploaded photos and videos live on local disk and/or S3-compatible object storage (`src/storage.ts`). A daily job (`src/orphans.ts`) deletes files that no database row references. Any new column or JSON field that stores uploaded file names must be added to `collectReferences()` in `src/orphans.ts` in the same change, or those files will be treated as unused and deleted. Delete files through `removeFiles` / `storage.remove` so the object storage copy is removed too.
