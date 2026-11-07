import { drizzle } from "@aws/aurora-dsql-drizzle";

// DSQL closes a connection after an hour, so ours retire first.
const MAX_CONNECTION_SECONDS = 55 * 60;

// The connector signs in with IAM, so no password exists to store.
export function connect(user: string) {
  const host = process.env.CLUSTER_ENDPOINT;
  if (!host) throw new Error("CLUSTER_ENDPOINT isn't set");

  return drizzle({
    connection: { host, user, max: 1, maxLifetimeSeconds: MAX_CONNECTION_SECONDS },
  });
}
