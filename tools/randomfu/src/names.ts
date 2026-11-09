/** Names for the spoiler log, from the extractor's enum tables. */
import { getNameResolver, type NameTable } from "../../mhfu-extract/src/strings/names.js";
import type { LoadedQuest } from "./game/load.js";

const names = getNameResolver();

export function itemName(id: number): string {
  return names.resolve("ItemID", id) ?? `Item ${id}`;
}

export function monsterName(emId: number): string {
  return names.resolve("emID", emId) ?? `Monster ${emId}`;
}

export function tableName(table: NameTable, id: number): string | null {
  return names.resolve(table, id);
}

export function questLabel(quest: LoadedQuest): string {
  const id = String(quest.parsed.header.questId).padStart(5, "0");
  const title = quest.parsed.strings?.title;
  return title ? `${id} ${title}` : id;
}
