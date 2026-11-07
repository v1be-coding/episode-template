// CI's database steps, run as admin after Terraform: node dist/db/deploy.cjs <step>
import { connect } from "./client.js";
import { describeError, grantAccess, runMigrations, seed } from "./setup.js";

const steps: Record<string, (db: ReturnType<typeof connect>) => Promise<void>> = {
  migrate: runMigrations,
  grant: (db) => grantAccess(db, process.env.API_ROLE_ARN ?? ""),
  seed,
};

async function main() {
  const step = steps[process.argv[2] ?? ""];
  if (!step) throw new Error(`Choose a step: ${Object.keys(steps).join(", ")}`);

  const db = connect("admin");
  try {
    await step(db);
  } finally {
    await db.$client.end();
  }
}

main().catch((error: unknown) => {
  console.error(describeError(error));
  process.exitCode = 1;
});
