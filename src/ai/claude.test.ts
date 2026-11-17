import Anthropic from "@anthropic-ai/sdk";
import { GetParameterCommand } from "@aws-sdk/client-ssm";
import { GetWebIdentityTokenCommand } from "@aws-sdk/client-sts";
import { describe, expect, it, vi } from "vitest";
import {
  AUDIENCE,
  classifyClaudeError,
  createClaude,
  federationParameterName,
  parseFederationIds,
} from "./claude.js";

const ids = {
  organization_id: "00000000-0000-4000-8000-000000000000",
  workspace_id: "wrkspc_test",
  service_account_id: "svac_test",
  federation_rule_id: "fdrl_test",
};

const ssmWith = (value: string | undefined) => ({
  send: vi
    .fn()
    .mockResolvedValue({ Parameter: value === undefined ? undefined : { Value: value } }),
});

const urlOf = (url: string | URL | Request) =>
  typeof url === "string" ? url : url instanceof URL ? url.href : url.url;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("parseFederationIds", () => {
  it("accepts the four IDs Setup saves", () => {
    expect(parseFederationIds(JSON.stringify(ids))).toEqual(ids);
  });

  it("refuses anything that isn't JSON", () => {
    expect(() => parseFederationIds("not json")).toThrow("isn't JSON");
  });

  it.each(Object.keys(ids))("refuses a missing or malformed %s", (key) => {
    expect(() => parseFederationIds(JSON.stringify({ ...ids, [key]: "nope" }))).toThrow(key);
  });
});

describe("federationParameterName", () => {
  it("is under the episode's third-party path", () => {
    expect(federationParameterName("portfolio-site")).toBe(
      "/portfolio-site/third-party/anthropic-federation",
    );
  });
});

describe("createClaude", () => {
  it("needs EPISODE", async () => {
    await expect(createClaude({ episode: "", ssm: ssmWith(JSON.stringify(ids)) })).rejects.toThrow(
      "EPISODE",
    );
  });

  it("reads the IDs from the episode's parameter", async () => {
    const ssm = ssmWith(JSON.stringify(ids));
    await createClaude({ episode: "demo", ssm, sts: { send: vi.fn() } });

    const command = ssm.send.mock.calls[0]?.[0] as GetParameterCommand;
    expect(command.input.Name).toBe("/demo/third-party/anthropic-federation");
  });

  it("fails clearly when the parameter is empty", async () => {
    await expect(
      createClaude({ episode: "demo", ssm: ssmWith(undefined), sts: { send: vi.fn() } }),
    ).rejects.toThrow("empty");
  });

  it("trades a 5-minute STS token for a Claude token, then calls with it", async () => {
    const sts = { send: vi.fn().mockResolvedValue({ WebIdentityToken: "aws-jwt" }) };
    const fetchMock = vi.fn((url: string | URL | Request, init?: RequestInit) => {
      const target = urlOf(url);
      if (target.endsWith("/v1/oauth/token")) {
        return Promise.resolve(
          json(200, { access_token: "sk-ant-oat01-test", token_type: "Bearer", expires_in: 600 }),
        );
      }
      const auth = new Headers(init?.headers).get("authorization");
      return Promise.resolve(
        json(200, {
          id: "msg_1",
          type: "message",
          role: "assistant",
          model: "claude-haiku-5-5",
          content: [{ type: "text", text: auth === "Bearer sk-ant-oat01-test" ? "OK" : "no auth" }],
          stop_reason: "end_turn",
          stop_sequence: null,
          usage: { input_tokens: 5, output_tokens: 1 },
        }),
      );
    });

    const client = await createClaude({
      episode: "demo",
      ssm: ssmWith(JSON.stringify(ids)),
      sts,
      fetch: fetchMock,
    });
    const reply = await client.messages.create({
      model: "claude-haiku-5-5",
      max_tokens: 10,
      messages: [{ role: "user", content: "Reply with OK" }],
    });

    const tokenCommand = sts.send.mock.calls[0]?.[0] as GetWebIdentityTokenCommand;
    expect(tokenCommand.input).toEqual({
      Audience: [AUDIENCE],
      SigningAlgorithm: "RS256",
      DurationSeconds: 300,
    });

    const exchange = fetchMock.mock.calls.find(([url]) => urlOf(url).endsWith("/v1/oauth/token"));
    const body = exchange?.[1]?.body;
    expect(typeof body).toBe("string");
    const sent = JSON.parse(body as string) as Record<string, string>;
    expect(sent).toMatchObject({
      assertion: "aws-jwt",
      federation_rule_id: ids.federation_rule_id,
      organization_id: ids.organization_id,
      service_account_id: ids.service_account_id,
      workspace_id: ids.workspace_id,
    });

    expect(reply.content[0]).toEqual({ type: "text", text: "OK" });
  });
});

describe("classifyClaudeError", () => {
  const apiError = (status: number | undefined, body: unknown) =>
    Anthropic.APIError.generate(status, body as object, undefined, new Headers());

  it("sorts the workspace's own spend limit, a 400", () => {
    const body = {
      type: "error",
      error: {
        type: "invalid_request_error",
        message: "You have reached your specified workspace API usage limits.",
      },
    };
    expect(classifyClaudeError(apiError(400, body))).toBe("spend_limit");
  });

  it("sorts the tier's cap, a 429 with its own error code", () => {
    const body = {
      type: "error",
      error: {
        type: "rate_limit_error",
        message: "Spend limit reached",
        details: { error_code: "enforced_spend_limit_reached" },
      },
    };
    expect(classifyClaudeError(apiError(429, body))).toBe("spend_limit");
  });

  it("sorts an ordinary rate limit", () => {
    const body = { type: "error", error: { type: "rate_limit_error", message: "Slow down" } };
    expect(classifyClaudeError(apiError(429, body))).toBe("rate_limit");
  });

  it("sorts overload by status, and mid-stream by type alone", () => {
    const body = { type: "error", error: { type: "overloaded_error", message: "Overloaded" } };
    expect(classifyClaudeError(apiError(529, body))).toBe("overloaded");
    // Mid-stream, the SDK throws a plain APIError with no status (SDK issue #1262).
    const midStream = new Anthropic.APIError(
      undefined,
      body,
      "Overloaded",
      undefined,
      "overloaded_error",
    );
    expect(classifyClaudeError(midStream)).toBe("overloaded");
  });

  it("sorts a refused token exchange", () => {
    const body = {
      type: "error",
      error: { type: "authentication_error", message: "Authentication failed" },
    };
    expect(classifyClaudeError(apiError(401, body))).toBe("auth");
  });

  it("sorts a timeout", () => {
    expect(classifyClaudeError(new Anthropic.APIConnectionTimeoutError())).toBe("timeout");
  });

  it("calls anything else other", () => {
    expect(classifyClaudeError(new Error("boom"))).toBe("other");
  });
});
