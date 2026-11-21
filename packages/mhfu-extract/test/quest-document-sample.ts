/** A made-up quest document that uses every part of the format. No game data. */
import type { QuestDoc, Spawn } from "../src/quests/document.js";

export function spawn(monster: number, over: Partial<Spawn> = {}): Spawn {
  return {
    monster,
    variant: 0,
    quantity: 1,
    power: 3,
    attr1: 0,
    attr2: 0,
    stage: 0,
    flag: 0,
    data1: [0, 0, 0, 0],
    rotation: 0x4000,
    x: 1200.5,
    y: -30,
    z: 9876.25,
    data2: [0, 0, 0, 7],
    ...over,
  };
}

export function sampleDoc(questId = 1001): QuestDoc {
  const block = (lang: string) => [
    `${lang} title ${questId}`,
    "Hunt 1 Thing",
    "Reward Zero\nTime Over",
    "Détails: ünïcödé ✓",
    "Thing",
    null,
  ];
  return {
    header: {
      objectives: [
        { kind: 1, id: 12, count: 1, slot: 1 },
        { kind: 0, id: 0, count: 0, slot: 2 },
      ],
      sizePercent: 105,
      clearPoints: 120,
      failurePoints: 15,
      rank: 1,
      spawn: 0,
      supplyCond: 1,
      unk47: 0,
      unk48: 0,
      statTable: 0,
      unk4a: 3,
      attackRoll: 10,
      questType: 4,
      fee: 100,
      reward: 1200,
      penalty: 400,
      timeLimit: 90000,
      questId,
      stars: 3,
      unk67: 1,
      map: 9,
      specialCond: 0,
      unk6a: 1,
      unk6c: 1,
      unk6d: 0,
      unk6e: 0,
      targetId: 12,
      targetNum: 1,
      unk74: 0,
      unk78: 0,
    },
    text: { slots: [0, 0, 1, 2, -1, 2, 0], blocks: [block("EN"), block("DE"), block("FR")] },
    arena: [
      {
        players: 1,
        pointMultiplier: 100,
        equipment: Array.from({ length: 6 }, (_, i) => ({
          unk: 0,
          type: i,
          id: 10 + i,
          level: 0,
          decorations: [1, 0, 2] as [number, number, number],
        })),
        items: Array.from({ length: 20 }, (_, i) => ({
          item: i < 3 ? 50 + i : 0,
          amount: i < 3 ? 5 : 0,
        })),
      },
    ],
    script: [
      [27, 0, 0, 0],
      [9, 150, 0, 0],
      [-1, 0, 0, 0],
    ],
    supplies: [
      { item: 863, amount: 1 },
      { item: 141, amount: 4 },
    ],
    suppliesEnd: questId,
    gatherTables: [
      {
        items: [
          { chance: 60, item: 120 },
          { chance: 40, item: 121 },
        ],
      },
      null,
      { items: [], alias: { of: 0, skip: 1 } },
      { items: [{ chance: 100, item: 0 }] },
    ],
    gatherAreas: [
      null,
      [{ x: 10, y: 0, z: -20.5, range: 150, table: 0, mostGathers: 6, type: 3, gathers: 2 }],
    ],
    rewards: [
      {
        kind: 0x8000,
        param: 0x400,
        items: [
          { chance: 70, item: 120, amount: 1 },
          { chance: 30, item: 121, amount: 2 },
        ],
      },
      { kind: 0x8001, param: 0, items: [{ chance: 100, item: 122, amount: 1 }] },
    ],
    positions: [{ stage: 40, points: [{ rotation: 1, x: 1, y: 2, z: 3 }] }],
    small: {
      sets: [0, 0, 1],
      lists: [
        {
          stamp: 1123,
          areas: [
            { stage: 92, group: 0 },
            { stage: 93, group: 2 },
          ],
        },
        { stamp: 9999, areas: [{ stage: 92, group: 0 }] },
      ],
      // Group 1 is one nothing points at, as on the disc.
      groups: [
        { preload: [35], spawns: [spawn(35, { quantity: 3 }), spawn(35, { flag: 1 })] },
        { preload: [], spawns: [] },
        { preload: [35, 13, 30, 16], spawns: [spawn(13), spawn(30), spawn(16)] },
      ],
    },
    large: [{ unk1: 1, unk2: 0, preload: [12], spawns: [spawn(12, { stage: 97, power: 4 })] }],
  };
}
