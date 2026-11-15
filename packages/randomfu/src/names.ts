/**
 * Names for hints and the spoiler log, from the extractor's enum tables,
 * with the disc's monster names where `useDiscMonsterNames` gave them.
 * They're randomfu's own: mhfu-extract's resolver is left as it is.
 */
import { getNameResolver, type NameTable } from "mhfu-extract/src/strings/names.js";
import type { GameData, LoadedQuest } from "./game/load.js";

const names = getNameResolver();
/** The disc's monster names by emID, from the game being randomized; null for the enum's. */
let discMonsters: readonly (string | null)[] | null = null;

/**
 * Names monsters as `game`'s disc does, or from `monster.enum` where it
 * can't be read. `randomize` calls it first, so its hints and the spoiler
 * log formatted from its result name monsters alike.
 */
export function useDiscMonsterNames(game: Pick<GameData, "monsterNames">): void {
  discMonsters = game.monsterNames ?? null;
}

const resolve = (table: NameTable, id: number): string | null =>
  table === "emID" && discMonsters ? (discMonsters[id] ?? null) : names.resolve(table, id);

export function itemName(id: number): string {
  return resolve("ItemID", id) ?? `Item ${id}`;
}

export function monsterName(emId: number): string {
  return resolve("emID", emId) ?? `Monster ${emId}`;
}

export function tableName(table: NameTable, id: number): string | null {
  return resolve(table, id);
}

export function questLabel(quest: LoadedQuest): string {
  const id = String(quest.parsed.header.questId).padStart(5, "0");
  const title = quest.parsed.strings?.title;
  return title ? `${id} ${title}` : id;
}
