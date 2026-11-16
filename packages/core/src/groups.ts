import seed from "../../../data/seed/groups.json";
import type { Generation, Group } from "./types";

export const GENERATIONS = [5, 4, 3, 2, 1] as const satisfies readonly Generation[];

function isGeneration(value: unknown): value is Generation {
  return typeof value === "number" && (GENERATIONS as readonly number[]).includes(value);
}

/**
 * Validates the groups seed (`data/seed/groups.json`, D-012). Throws on a malformed entry so a bad
 * seed fails at build/test time instead of rendering half a list.
 */
export function parseGroups(raw: unknown): Group[] {
  const list = (raw as { groups?: unknown })?.groups;
  if (!Array.isArray(list)) throw new Error("groups seed: missing `groups` array");
  const seen = new Set<string>();
  return list.map((entry: unknown, index) => {
    const item = entry as Record<string, unknown>;
    const { id, name, generation, aka, editorialCheck } = item;
    if (typeof id !== "string" || !/^[a-z0-9-]+$/.test(id)) throw new Error(`groups seed #${index}: bad id`);
    if (seen.has(id)) throw new Error(`groups seed: duplicate id ${id}`);
    seen.add(id);
    if (typeof name !== "string" || name.length === 0) throw new Error(`groups seed ${id}: bad name`);
    if (!isGeneration(generation)) throw new Error(`groups seed ${id}: bad generation`);
    if (aka !== undefined && typeof aka !== "string") throw new Error(`groups seed ${id}: bad aka`);
    const group: Group = { id, name, generation, editorialCheck: editorialCheck !== false };
    if (aka) group.aka = aka;
    return group;
  });
}

/** All seeded groups (artist metadata only). */
export const groups: readonly Group[] = parseGroups(seed);

export function groupById(id: string | undefined): Group | undefined {
  return id ? groups.find((group) => group.id === id) : undefined;
}
