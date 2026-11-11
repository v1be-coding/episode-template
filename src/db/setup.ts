import { migrate, withRetry } from "@aws/aurora-dsql-drizzle";
import { sql, type SQL } from "drizzle-orm";
import { connect } from "./client.js";
import { notes } from "./schema.js";
import { seedNotes } from "./seed-data.js";

type Admin = ReturnType<typeof connect>;
type Seed = typeof notes.$inferInsert;

const ROLE_ARN = /^arn:aws:iam::\d{12}:role\/[\w+=,.@-]+$/;

// The ARN holds the account ID, so it comes from CI and stays out of migrations.
export function loginStatement(roleArn: string): string {
  if (!ROLE_ARN.test(roleArn)) throw new Error("API_ROLE_ARN is not an IAM role ARN");
  return `AWS IAM GRANT api TO '${roleArn}'`;
}

export const accessStatements = [
  "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO api",
];

// Drizzle reports only the query, and the reason sits on the cause.
export function describeError(error: unknown): string {
  if (!(error instanceof Error)) return String(error);
  return error.cause instanceof Error ? `${error.message}: ${error.cause.message}` : error.message;
}

const run = (db: Admin, statement: string) => withRetry(() => db.execute(sql.raw(statement)));

const exists = async (db: Admin, query: SQL) => {
  const { rows } = await withRetry(() => db.execute(query));
  return rows.length > 0;
};

export async function runMigrations(db: Admin): Promise<void> {
  const result = await migrate(db, { migrationsFolder: "./drizzle" });
  if (!result.success) {
    throw new Error(`${result.error.migrationName}: ${result.error.message}`);
  }
}

// Runs on every deploy, so a new table is covered with no extra work (Q49).
export async function grantAccess(db: Admin, roleArn: string): Promise<void> {
  const login = loginStatement(roleArn);

  if (!(await exists(db, sql`SELECT 1 FROM pg_roles WHERE rolname = 'api'`))) {
    await run(db, "CREATE ROLE api WITH LOGIN");
  }
  const mapped = sql`SELECT 1 FROM sys.iam_pg_role_mappings
    WHERE pg_role_name = 'api' AND arn = ${roleArn}`;
  if (!(await exists(db, mapped))) {
    await run(db, login);
  }
  for (const statement of accessStatements) {
    await run(db, statement);
  }
}

// DO NOTHING, so a repeat never overwrites a row. Never runs on café production (Q44).
export async function seed(db: Admin, rows: Seed[] = seedNotes): Promise<void> {
  if (rows.length === 0) return;

  await db.transactionWithRetry((tx) =>
    tx.insert(notes).values(rows).onConflictDoNothing({ target: notes.id }),
  );
}
