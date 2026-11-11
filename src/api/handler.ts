import type { APIGatewayProxyEventV2, APIGatewayProxyResultV2 } from "aws-lambda";
import { countNotes, getNote, putNote } from "../db/notes.js";
import { guardRequest } from "../limits/guard.js";

const NOTE_PATH = /^\/api\/notes\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
const MAX_TEXT_LENGTH = 1000;

export async function handler(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  const refused = await guardRequest(event);
  if (refused) return refused;

  if (event.rawPath === "/api/health") {
    return json(200, { status: "ok" });
  }

  // "count" isn't a UUID, so this can't shadow GET /api/notes/<id>.
  if (event.rawPath === "/api/notes/count") {
    return countRoute(event);
  }

  const id = NOTE_PATH.exec(event.rawPath)?.[1];
  if (id) {
    return notesRoute(event, id);
  }

  return json(404, { error: "Not found" });
}

async function countRoute(event: APIGatewayProxyEventV2): Promise<APIGatewayProxyResultV2> {
  if (event.requestContext.http.method !== "GET") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    return json(200, { count: await countNotes() });
  } catch (error) {
    console.error("Couldn't count notes", error);
    return json(500, { error: "Internal error" });
  }
}

async function notesRoute(
  event: APIGatewayProxyEventV2,
  id: string,
): Promise<APIGatewayProxyResultV2> {
  const method = event.requestContext.http.method;

  if (method === "GET") {
    const note = await getNote(id);
    return note ? json(200, note) : json(404, { error: "Not found" });
  }

  if (method === "PUT") {
    const text = readText(event.body);
    if (text === undefined) {
      return json(400, { error: `text must be 1 to ${MAX_TEXT_LENGTH} characters` });
    }
    await putNote(id, text);
    return json(200, { id, text });
  }

  return json(405, { error: "Method not allowed" });
}

function readText(body: string | undefined): string | undefined {
  try {
    const { text } = JSON.parse(body ?? "") as { text?: unknown };
    return typeof text === "string" && text.length > 0 && text.length <= MAX_TEXT_LENGTH
      ? text
      : undefined;
  } catch {
    return undefined;
  }
}

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  };
}
