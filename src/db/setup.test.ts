import { describe, expect, it, vi } from "vitest";
import { accessStatements, loginStatement, seed } from "./setup.js";

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
  it("gives the app read and write access to tables, and nothing on the schema", () => {
    expect(accessStatements).toEqual([
      "GRANT USAGE ON SCHEMA public TO api",
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
