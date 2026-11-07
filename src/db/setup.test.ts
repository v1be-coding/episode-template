import { describe, expect, it, vi } from "vitest";
import { accessStatements, describeError, loginStatement, seed } from "./setup.js";

const arn = "arn:aws:iam::000000000000:role/v1be-sample-api-production";

describe("loginStatement", () => {
  it("maps the database role to the Lambda's role", () => {
    expect(loginStatement(arn)).toBe(`AWS IAM GRANT api TO '${arn}'`);
  });

  it.each(["", "arn:aws:iam::000000000000:user/someone", `${arn}'; DROP TABLE notes; --`])(
    "refuses %j",
    (value) => {
      expect(() => loginStatement(value)).toThrow("not an IAM role ARN");
    },
  );
});

describe("accessStatements", () => {
  it("gives the app read and write access to tables, and no schema rights", () => {
    expect(accessStatements).toEqual([
      "GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO api",
    ]);
  });
});

describe("seed", () => {
  it("does nothing when an episode has no seed data", async () => {
    const transactionWithRetry = vi.fn();

    await seed({ transactionWithRetry } as unknown as Parameters<typeof seed>[0], []);

    expect(transactionWithRetry).not.toHaveBeenCalled();
  });
});

describe("describeError", () => {
  it("includes the database's own reason, which Drizzle wraps", () => {
    const error = new Error("Failed query", { cause: new Error("permission denied") });

    expect(describeError(error)).toBe("Failed query: permission denied");
  });

  it("copes with an error that has no cause", () => {
    expect(describeError(new Error("no endpoint"))).toBe("no endpoint");
  });
});
