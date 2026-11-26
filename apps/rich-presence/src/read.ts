/**
 * Reads what the presence shows from a running PPSSPP, every read inside
 * one debugger pause (`withPause`), as the site's PPSSPP link does.
 */
// With its extension: without one, Node finds area-numbers.json beside it first.
import { areaNumber } from "blacksmith/src/lib/area-numbers.ts";
import { withPause, type PpssppDebugger } from "blacksmith/src/lib/ppsspp-link";
import {
  QUEST_HEADER_SIZE,
  RELEASES,
  SNAPSHOT_SIZE,
  mapStagesEntry,
  onQuest,
  parseMapStagesEntry,
  parseQuestHeader,
  parseSnapshot,
  parseStageList,
  snapshotStart,
  type Hunter,
  type QuestHeader,
} from "./layout";

export type GameState =
  | { kind: "noGame" }
  | { kind: "otherGame"; gameId: string; title: string }
  /** MHFU, but a release whose addresses aren't known. */
  | { kind: "unsupported"; gameId: string }
  /** The title screen or the save menus: no hunter loaded. */
  | { kind: "menus"; gameId: string }
  | { kind: "town"; gameId: string; hunter: Hunter; stage: number }
  | {
      kind: "quest";
      gameId: string;
      hunter: Hunter;
      quest: QuestHeader;
      /** 0 under way, 1 completed or timed out, 2 the rewards. */
      state: number;
      timeLeft: number;
      stage: number;
      /**
       * The area number the game's map prints (0 is the Base Camp), or null
       * if the map's stage list has no such stage.
       */
      area: number | null;
    };

/**
 * The map art a quest map draws (mhfu-extract's `mapTextureName`): night
 * maps without their own use the day map's.
 */
const NIGHT_TEXTURES: Readonly<Record<number, number>> = { 16: 2, 18: 4, 21: 11, 31: 30 };
export const mapTexture = (map: number) => `map${NIGHT_TEXTURES[map] ?? map}`;

const MHFU_TITLE = /monster hunter|モンスターハンター|MHP2|freedom unite/i;

export async function readGame(dbg: PpssppDebugger): Promise<GameState> {
  const status = await dbg.call("game.status");
  const game = status.game as { id?: string; title?: string } | null | undefined;
  if (!game?.id) return { kind: "noGame" };
  const gameId = game.id;
  const release = RELEASES[gameId];
  if (!release) {
    return MHFU_TITLE.test(game.title ?? "")
      ? { kind: "unsupported", gameId }
      : { kind: "otherGame", gameId, title: game.title ?? gameId };
  }

  return withPause(dbg, async (): Promise<GameState> => {
    const snapshot = parseSnapshot(await dbg.read(snapshotStart(release), SNAPSHOT_SIZE));
    const { hunter, stage } = snapshot;
    if (!hunter) return { kind: "menus", gameId };
    if (!onQuest(snapshot.quest)) return { kind: "town", gameId, hunter, stage };
    const quest = parseQuestHeader(await dbg.read(snapshot.quest.file, QUEST_HEADER_SIZE));
    if (!quest) return { kind: "town", gameId, hunter, stage };
    const entry = parseMapStagesEntry(await dbg.read(mapStagesEntry(release, quest.map), 8));
    const stages = entry
      ? parseStageList(await dbg.read(entry.list, entry.count * 2), entry.count)
      : [];
    const index = stages.indexOf(stage);
    return {
      kind: "quest",
      gameId,
      hunter,
      quest,
      state: snapshot.quest.state,
      timeLeft: snapshot.quest.timeLeft,
      stage,
      area: index < 0 ? null : areaNumber(mapTexture(quest.map), index),
    };
  });
}
