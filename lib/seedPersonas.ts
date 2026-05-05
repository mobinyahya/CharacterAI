import type { UserPersona } from "@/types";

/**
 * The user-persona library starts empty. The six canonical evaluation personas
 * from `ChatEval.md` live in `lib/evalPersonas.ts` as a system catalog and are
 * NOT seeded into the editable library — they are picked from a fixed catalog
 * inside the `/evaluate` runner.
 *
 * This function is kept (instead of removed) so the storage seeding code path
 * is stable; if we want to ship example user-created personas later we just
 * extend this list.
 */
export function buildSeedPersonas(): UserPersona[] {
  return [];
}
