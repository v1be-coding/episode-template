import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { describe, expect, it } from "vitest";
import { handler } from "./handler.js";

const request = (rawPath: string) => ({ rawPath }) as APIGatewayProxyEventV2;

describe("handler", () => {
  it("reports healthy on /api/health", async () => {
    const response = await handler(request("/api/health"));

    expect(response).toMatchObject({ statusCode: 200, body: '{"status":"ok"}' });
  });

  it("returns 404 for anything else", async () => {
    const response = await handler(request("/nope"));

    expect(response).toMatchObject({ statusCode: 404 });
  });
});
