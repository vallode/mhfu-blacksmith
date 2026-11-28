/**
 * Names for hints and the spoiler log: items and equipment from the
 * extractor's enum tables, monsters as the disc being randomized names
 * them (`monsterNames`), passed to whatever writes them.
 */
import { getNameResolver, type NameTable } from "mhfu-extract/src/strings/names.js";
import type { GameData, LoadedQuest } from "./game/load.js";

const names = getNameResolver();

/** A monster's name by emID. */
export type MonsterNames = (emId: number) => string;

/** `monster.enum`'s names: a JP disc's, or an EU disc's whose names can't be read. */
export const enumMonsterNames: MonsterNames = (emId) =>
  names.resolve("emID", emId) ?? `Monster ${emId}`;

/** Monsters named as `game`'s disc names them (`GameData.monsterNames`), else as the enum does. */
export function monsterNames(game: Pick<GameData, "monsterNames">): MonsterNames {
  const disc = game.monsterNames;
  return disc ? (emId) => disc[emId] ?? `Monster ${emId}` : enumMonsterNames;
}

export function itemName(id: number): string {
  return names.resolve("ItemID", id) ?? `Item ${id}`;
}

export function tableName(table: NameTable, id: number): string | null {
  return names.resolve(table, id);
}

export function questLabel(quest: LoadedQuest): string {
  const id = String(quest.parsed.header.questId).padStart(5, "0");
  const title = quest.parsed.strings?.title;
  return title ? `${id} ${title}` : id;
}
