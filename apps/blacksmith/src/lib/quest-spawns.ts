/**
 * The Map tab's monster markers: a quest's spawn records (lib/quests
 * QuestSpawn) grouped into one marker per area, with each species' records
 * summed. Pure, so the component and its tests share it.
 */
import type { QuestSpawn } from "./quests";

/** One species in an area: its records summed, and whether any keeps coming. */
export interface AreaMonster {
  spawn: QuestSpawn;
  quantity: number;
  endless: boolean;
}

/** The monsters in one area, large ones first, then the most plentiful. */
export function areaMonsters(spawns: QuestSpawn[]): AreaMonster[] {
  const byMonster = new Map<string, AreaMonster>();
  for (const spawn of spawns) {
    const key = `${spawn.kind}:${spawn.monster.name}`;
    const group = byMonster.get(key) ?? { spawn, quantity: 0, endless: false };
    if (spawn.endless) group.endless = true;
    else group.quantity += spawn.quantity;
    byMonster.set(key, group);
  }
  return [...byMonster.values()].sort(
    (a, b) =>
      Number(b.spawn.kind === "large") - Number(a.spawn.kind === "large") ||
      b.quantity - a.quantity ||
      a.spawn.monster.name.localeCompare(b.spawn.monster.name),
  );
}

/** The spawns of one area, marked at its lead spawn's point. */
export interface SpawnArea {
  area: number;
  x: number;
  y: number;
  spawns: QuestSpawn[];
  monsters: AreaMonster[];
}

/** The area's mark: a large monster's record if it has one, else its most plentiful small one. */
export function leadSpawn(spawns: QuestSpawn[]): QuestSpawn {
  const large = spawns.filter((spawn) => spawn.kind === "large");
  const pool = large.length > 0 ? large : spawns;
  return pool.reduce((best, spawn) => (spawn.quantity > best.quantity ? spawn : best));
}

/** Every area with a monster in it, one marker each, so small packs don't crowd the map. */
export function spawnAreas(spawns: QuestSpawn[]): SpawnArea[] {
  const byArea = new Map<number, QuestSpawn[]>();
  for (const spawn of spawns) {
    const list = byArea.get(spawn.area);
    if (list) list.push(spawn);
    else byArea.set(spawn.area, [spawn]);
  }
  return [...byArea.entries()]
    .sort(([a], [b]) => a - b)
    .map(([area, list]) => {
      const lead = leadSpawn(list);
      return {
        area,
        x: lead.x,
        y: lead.y,
        spawns: list,
        monsters: areaMonsters(list),
      };
    });
}
