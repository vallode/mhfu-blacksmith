/**
 * Small monster species: which small monsters a Village or Guild quest
 * has. Works on quest documents, like the map moves (`quest-maps.ts`), and
 * runs after them, so a moved quest swaps the small monsters it took.
 *
 * Small monsters are set per area: each area's entry points at a group of
 * spawns and that group's preload list (up to four species, what the game
 * loads for the area). A swap is one mapping per quest (old species -> new),
 * applied to every spawn and preload entry, so each group keeps how many
 * species it loads and the quest never ends up with two of one.
 *
 * A species only becomes one the disc's Village and Guild quests have in
 * every stage (area) it's in, so Cephalos stay in sand and nothing new is
 * put where it has never been. Monsters the goal names stay (a quest to
 * slay Velociprey keeps them), and delivery quests keep theirs (they may
 * be what the item comes from). Rocks and Great Thunderbugs are spawned as
 * small monsters but are things in the area, not creatures: they stay too.
 */
import type { QuestDoc } from "mhfu-extract/src/quests/document.js";
import { questLabel, type MonsterNames } from "whetstone/src/names.js";
import type { Rng } from "../rng.js";
import { isDelivery, namedMonsters, type DocQuest } from "./quest-maps.js";
import { getOrInsert } from "./shuffle.js";
import type { Report } from "whetstone/src/report.js";

/** Spawned like small monsters, but part of the area: Rocks and Great Thunderbug (emIDs). */
export const PROPS: ReadonlySet<number> = new Set([29, 56]);

/** Draws before giving up on a quest whose species box each other in. */
const ATTEMPTS = 20;

/** Each small monster's stages in a quest: every stage whose area uses a group it's in. */
function stagesBySpecies(doc: QuestDoc): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>();
  for (const list of doc.small.lists) {
    for (const area of list.areas) {
      for (const spawn of doc.small.groups[area.group]?.spawns ?? []) {
        getOrInsert(out, spawn.monster, () => new Set()).add(area.stage);
      }
    }
  }
  return out;
}

/** The small monsters each stage has in any of `list`'s quests, as on the disc. */
export function smallByStage(list: readonly DocQuest[]): Map<number, Set<number>> {
  const out = new Map<number, Set<number>>();
  for (const { vanilla } of list) {
    for (const [species, stages] of stagesBySpecies(vanilla)) {
      for (const stage of stages) getOrInsert(out, stage, () => new Set()).add(species);
    }
  }
  return out;
}

export function swapSmallSpecies(
  list: readonly DocQuest[],
  rng: Rng,
  /** Names monsters in the report (`names.ts` `monsterNames`). */
  monsterName: MonsterNames,
): Report {
  const byStage = smallByStage(list);
  const lines: Report["lines"] = [];
  let deliveries = 0;
  let conflicts = 0;
  for (const entry of list) {
    const doc = entry.doc;
    if (isDelivery(doc)) {
      deliveries++;
      continue;
    }
    const named = new Set(namedMonsters(doc));
    const stages = stagesBySpecies(doc);
    const species = [...stages.keys()].sort((a, b) => a - b);
    const fixed = (id: number) => named.has(id) || PROPS.has(id);
    const options = new Map(
      species
        .filter((old) => !fixed(old))
        .map((old) => {
          const where = [...stages.get(old)!];
          const found = [...(byStage.get(where[0]!) ?? [])].filter(
            (id) => !fixed(id) && where.every((stage) => byStage.get(stage)?.has(id)),
          );
          return [old, found.sort((a, b) => a - b)];
        }),
    );
    // Species the swap leaves where they are: the fixed ones, and any only in
    // a preload list or a group no area uses. Nothing becomes one of them.
    const kept = new Set(
      doc.small.groups
        .flatMap((g) => [...g.preload, ...g.spawns.map((s) => s.monster)])
        .filter((id) => !options.has(id)),
    );
    // One species each, never a kept one: species are drawn in a random
    // order, and a draw that boxes a later one in starts again.
    let mapping: Map<number, number> | null = null;
    for (let attempt = 0; attempt < ATTEMPTS && !mapping; attempt++) {
      const taken = new Set(kept);
      const drawn = new Map<number, number>();
      for (const old of rng.shuffle([...options.keys()])) {
        const free = options.get(old)!.filter((id) => !taken.has(id));
        if (free.length === 0) break;
        const next = free[rng.int(free.length)]!;
        taken.add(next);
        drawn.set(old, next);
      }
      if (drawn.size === options.size) mapping = drawn;
    }
    if (!mapping) {
      conflicts++;
      continue;
    }
    for (const [old, next] of mapping) if (old === next) mapping.delete(old);
    if (mapping.size === 0) continue;
    const swap = (id: number) => mapping.get(id) ?? id;
    entry.doc = {
      ...doc,
      small: {
        ...doc.small,
        groups: doc.small.groups.map((group) => ({
          preload: group.preload.map(swap),
          spawns: group.spawns.map((s) => ({ ...s, monster: swap(s.monster) })),
        })),
      },
    };
    for (const [old, next] of mapping) {
      lines.push({
        where: questLabel(entry.quest),
        text: `${monsterName(next)} (was ${monsterName(old)})`,
      });
    }
  }
  const notes = [
    "Each small monster species in a Village or Guild quest became another, the same one wherever it was in the quest. A species only becomes one the disc's quests have in every area it's in.",
    "Small monsters the quest's goal names stay, as do delivery quests' small monsters, Rocks and Great Thunderbugs.",
  ];
  if (deliveries > 0) notes.push(`${deliveries} delivery quests kept their small monsters.`);
  if (conflicts > 0) {
    notes.push(`${conflicts} quests kept theirs: some species had nothing left to become.`);
  }
  return { title: "Small monster species", notes, lines };
}
