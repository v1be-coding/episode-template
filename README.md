# episode-template
Where every V1be Coding episode starts.

## Database

Aurora DSQL through `@aws/aurora-dsql-drizzle` (ADR-0003). Change `src/db/schema.ts`, run `npm run db:generate`, then review and commit what lands in `drizzle/`.

- **Migrations only add things.** A revert can't undo one, and `deploy.yml` refuses any that don't.
- **Writes are upserts keyed by client-generated IDs, inside `transactionWithRetry`,** because any write may be retried.
- **`src/db/seed-data.ts` holds fake data only.** It loads on every `portfolio` target and never on café production.
