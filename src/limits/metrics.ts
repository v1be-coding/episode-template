import { limitsConfig } from "./config.js";

export type LimitMetric = "RateLimited" | "SpendCapReached";

// CloudWatch's embedded metric format: a JSON log line becomes a metric, with no
// extra rights. Written straight to stdout, because console.log adds a prefix
// that stops CloudWatch reading it. Extra fields stay plain fields, never
// dimensions, as each dimension value is billed as its own metric (Q61).
export function recordMetric(
  name: LimitMetric,
  fields: Record<string, string | number> = {},
): void {
  const { episode, target } = limitsConfig();
  const line = {
    _aws: {
      Timestamp: Date.now(),
      CloudWatchMetrics: [
        {
          Namespace: `v1be/${episode}`,
          Dimensions: [["Target"]],
          Metrics: [{ Name: name, Unit: "Count" }],
        },
      ],
    },
    Target: target,
    [name]: 1,
    ...fields,
  };
  process.stdout.write(`${JSON.stringify(line)}\n`);
}
