import { pgTable, text, uuid } from "drizzle-orm/pg-core";

// IDs come from the client, so a retried write lands on the same row (ADR-0003).
export const notes = pgTable("notes", {
  id: uuid().primaryKey(),
  text: text().notNull(),
});
