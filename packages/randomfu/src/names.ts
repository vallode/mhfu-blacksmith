/**
 * Names for hints and the spoiler log, from the extractor's enum tables,
 * with the disc's monster names where `useDiscMonsterNames` gave them.
 */
import {
  getNameResolver,
  useMonsterNames,
  type NameTable,
} from "mhfu-extract/src/strings/names.js";
import type { GameData, LoadedQuest } from "./game/load.js";

/** Names monsters as `game`'s disc does, or from `monster.enum` where it can't be read. */
export function useDiscMonsterNames(game: Pick<GameData, "monsterNames">): void {
  useMonsterNames(game.monsterNames ?? null);
}

const resolve = (table: NameTable, id: number) => getNameResolver().resolve(table, id);

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
