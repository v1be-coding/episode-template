import type { APIGatewayProxyEventV2 } from "aws-lambda";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getNote, putNote } from "../db/notes.js";
import { guardRequest } from "../limits/guard.js";
import { handler } from "./handler.js";

vi.mock("../db/notes.js", () => ({ getNote: vi.fn(), putNote: vi.fn() }));
vi.mock("../limits/guard.js", () => ({ guardRequest: vi.fn() }));

const id = "6f1c2f6e-3f0a-4a53-9d7e-0a4f9c1b2d3e";

const request = (method: string, rawPath: string, body?: string) =>
  ({ rawPath, body, requestContext: { http: { method } } }) as unknown as APIGatewayProxyEventV2;

describe("handler", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("reports healthy on /api/health", async () => {
    const response = await handler(request("GET", "/api/health"));

    expect(response).toMatchObject({ statusCode: 200, body: '{"status":"ok"}' });
  });

  it("sends the guard's response instead of running a route", async () => {
    vi.mocked(guardRequest).mockResolvedValue({ statusCode: 429, body: "{}" });

    const response = await handler(request("PUT", `/api/notes/${id}`, '{"text":"hi"}'));

    expect(response).toMatchObject({ statusCode: 429 });
    expect(putNote).not.toHaveBeenCalled();
  });

  it("returns 404 for anything else", async () => {
    const response = await handler(request("GET", "/nope"));

    expect(response).toMatchObject({ statusCode: 404 });
  });

  it("saves a note under the client's ID", async () => {
    const response = await handler(
      request("PUT", `/api/notes/${id}`, JSON.stringify({ text: "hello" })),
    );

    expect(putNote).toHaveBeenCalledWith(id, "hello");
    expect(response).toMatchObject({ statusCode: 200 });
    expect(JSON.parse((response as { body: string }).body)).toEqual({ id, text: "hello" });
  });

  it("returns a saved note", async () => {
    vi.mocked(getNote).mockResolvedValue({ id, text: "hello" });

    const response = await handler(request("GET", `/api/notes/${id}`));

    expect(response).toMatchObject({ statusCode: 200 });
    expect(JSON.parse((response as { body: string }).body)).toEqual({ id, text: "hello" });
  });

  it("returns 404 for a note that doesn't exist", async () => {
    vi.mocked(getNote).mockResolvedValue(undefined);

    const response = await handler(request("GET", `/api/notes/${id}`));

    expect(response).toMatchObject({ statusCode: 404 });
  });

  it.each([
    ["no body", undefined],
    ["invalid JSON", "{"],
    ["text that isn't a string", '{"text":1}'],
    ["empty text", '{"text":""}'],
    ["text over 1,000 characters", JSON.stringify({ text: "x".repeat(1001) })],
  ])("refuses %s", async (_name, body) => {
    const response = await handler(request("PUT", `/api/notes/${id}`, body));

    expect(response).toMatchObject({ statusCode: 400 });
    expect(putNote).not.toHaveBeenCalled();
  });

  it("returns 404 for an ID that isn't a UUID", async () => {
    const response = await handler(request("GET", "/api/notes/not-a-uuid"));

    expect(response).toMatchObject({ statusCode: 404 });
    expect(getNote).not.toHaveBeenCalled();
  });

  it("returns 405 for a method the notes route doesn't take", async () => {
    const response = await handler(request("DELETE", `/api/notes/${id}`));

    expect(response).toMatchObject({ statusCode: 405 });
  });
});
