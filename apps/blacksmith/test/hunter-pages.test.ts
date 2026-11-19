import assert from "node:assert/strict";
import { test } from "node:test";
import { questProgress } from "../src/lib/hunter-pages";
import type { Quest } from "../src/lib/quests";
import type { SaveData } from "../src/lib/save-store";

const quest = (id: number, hub: Quest["hub"], stars: number) => ({ id, hub, stars }) as Quest;

test("questProgress leaves out the downloaded quests, which a save has no cleared bit for", () => {
  const quests = [
    quest(10001, "village", 1),
    quest(10002, "village", 1),
    quest(60010, "event", 11),
    quest(61001, "challenge", 1),
  ];
  const save = { clearedQuests: [10001] } as unknown as SaveData;
  const progress = questProgress(quests, save);
  assert.deepEqual([progress.done, progress.total], [1, 2]);
  assert.ok(progress.boards.every((b) => b.hub !== "event" && b.hub !== "challenge"));
});
