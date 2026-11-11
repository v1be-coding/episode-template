import { eq } from "drizzle-orm";
import { connect } from "./client.js";
import { notes } from "./schema.js";

export type Note = typeof notes.$inferSelect;

let db: ReturnType<typeof connect> | undefined;

// Created on first use, so /api/health works without a database.
function database() {
  db ??= connect(process.env.DB_USER ?? "api");
  return db;
}

// An upsert inside the retry, because DSQL can reject any write with 40001.
export async function putNote(id: string, text: string): Promise<void> {
  await database().transactionWithRetry((tx) =>
    tx.insert(notes).values({ id, text }).onConflictDoUpdate({
      target: notes.id,
      set: { text },
    }),
  );
}

export async function countNotes(): Promise<number> {
  return database().$count(notes);
}

export async function getNote(id: string): Promise<Note | undefined> {
  const [note] = await database().select().from(notes).where(eq(notes.id, id));
  return note;
}
