import type { notes } from "./schema.js";

// Fake data only (ADR-0005), with fixed IDs so a repeat adds nothing. Leave this
// empty if an episode wants no sample rows on its live site.
export const seedNotes: (typeof notes.$inferInsert)[] = [
  { id: "00000000-0000-4000-8000-000000000001", text: "Sample note from the seed step" },
];
