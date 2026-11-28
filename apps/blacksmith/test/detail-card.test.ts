/**
 * Weapon, item and drops cards (lib/detail-card.ts, lib/detail-card-data.ts):
 * the Worker finds them by path, their contents come from data/, their URLs
 * change with what they show, and they lay out with satori.
 */
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import satori from "satori";
import { route } from "../src/cloudflare/routes";
import { CARD_FONT, CARD_FONT_PATH } from "../src/lib/card-tree";
import {
  CARD,
  cardImagePaths,
  detailCardTree,
  detailCardUrl,
  parseDetailCardPath,
  type DetailCardAssets,
  type DetailCardKind,
} from "../src/lib/detail-card";
import { buildDetailCardData } from "../src/lib/detail-card-data";

const data = buildDetailCardData();

describe("detail card paths", () => {
  it("names a card by its kind and key", () => {
    assert.deepEqual(parseDetailCardPath("/embed/cards/weapons/long-sword/bone-g.png"), {
      kind: "weapons",
      key: "long-sword/bone-g",
    });
    assert.deepEqual(parseDetailCardPath("/embed/cards/items/rathian-plate.png"), {
      kind: "items",
      key: "rathian-plate",
    });
    assert.deepEqual(parseDetailCardPath("/embed/cards/drops/rathian/high-rank.png"), {
      kind: "drops",
      key: "rathian/high-rank",
    });
  });

  it("leaves other paths alone, the monster cards the build draws among them", () => {
    for (const p of [
      "/embed/cards/monsters/rathian.png",
      "/embed/cards/items/a/b.png",
      "/embed/cards/weapons/bone-g.png",
      "/embed/cards/weapons/../../etc.png",
      "/embed/card-data/weapons.json",
    ]) {
      assert.equal(parseDetailCardPath(p), null, p);
    }
    assert.deepEqual(route(new URL("https://x.example/embed/cards/monsters/rathian.png"), "GET"), {
      kind: "asset",
    });
  });

  it("routes a card's path to the Worker's card, GET and HEAD only", () => {
    const url = new URL("https://x.example/embed/cards/items/dung.png?v=1.abc");
    assert.deepEqual(route(url, "GET"), { kind: "detail-card", card: "items", key: "dung" });
    assert.deepEqual(route(url, "POST"), { kind: "asset" });
  });

  it("gives a card a new URL when what it shows changes", () => {
    const card = data.items["dung"]!;
    const url = detailCardUrl("items", "dung", card);
    assert.match(url, /^\/embed\/cards\/items\/dung\.png\?v=\d+\.\w+$/);
    assert.equal(detailCardUrl("items", "dung", { ...card }), url);
    assert.notEqual(detailCardUrl("items", "dung", { ...card, price: 11 }), url);
  });
});

describe("detail card contents", () => {
  it("has every weapon under its type and slug", () => {
    const bone = data.weapons["long-sword/bone-g"]!;
    assert.equal(bone.name, "Bone G");
    assert.deepEqual(bone.sharpness, [3, 7, 18, 4, 3]);
    assert.deepEqual(
      bone.create?.mats.map((m) => [m.name, m.amount]),
      [
        ["Commendation G", 1],
        ["Mystery Bone", 20],
        ["Brute Bone", 40],
        ["Massive Bone", 5],
      ],
    );
    assert.equal(bone.icon, "/embed/icons/long-sword-rarity-9.png");
    assert.equal(bone.upgrade, undefined);
    const halberd = data.weapons["long-sword/demon-halberd"]!;
    assert.deepEqual(halberd.upgrade?.from, ["Carbalite Sword+"]);
    assert.ok(halberd.stats.some((s) => s.value === "Thunder 180" && s.sprite === "thunder"));
  });

  it("lists an item's best drops and rewards", () => {
    const plate = data.items["rathian-plate"]!;
    assert.deepEqual(plate.drops[0], {
      monster: "Rathian",
      ranks: "HR",
      ways: [
        { how: "Tail carves", chance: 12 },
        { how: "Break head", chance: 6 },
        { how: "Capture", chance: 6 },
      ],
    });
    assert.equal(plate.rewards[0]?.quest, "Two Queens");
  });

  it("has a monster's drops at each rank, carve counts in the titles", () => {
    const hr = data.drops["rathian/high-rank"]!;
    assert.equal(hr.rank, "High Rank");
    const tail = hr.groups.find((g) => g.title === "Tail carves ×1");
    assert.deepEqual(tail?.rows[2], { name: "Rathian Plate", chance: 12 });
    assert.ok(data.drops["rathian/low-rank-1-2"]);
    assert.ok(data.drops["rathian/g-rank"]);
  });
});

describe("detail card layout", () => {
  const font = fs.readFileSync(path.join(process.cwd(), "public", CARD_FONT_PATH));
  // A 1×1 transparent PNG for every image: the layout is what's under test.
  const pixel =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const assets: DetailCardAssets = {
    frame: pixel,
    sprites: new Proxy({}, { get: () => pixel }) as Record<string, string>,
  };
  const draw = (kind: DetailCardKind, card: Parameters<typeof cardImagePaths>[1]) =>
    satori(
      detailCardTree(
        kind,
        card,
        assets,
        Object.fromEntries(cardImagePaths(kind, card).map((p) => [p, pixel])),
      ) as never,
      {
        width: CARD.width,
        height: CARD.height,
        fonts: [{ name: CARD_FONT, data: font, weight: 400, style: "normal" }],
      },
    );

  it("lays out drops, weapons and items cards of every shape", async () => {
    const sample = <T>(entries: T[], every: number) => entries.filter((_, i) => i % every === 0);
    const cards: (readonly [DetailCardKind, Parameters<typeof cardImagePaths>[1]] | undefined)[] = [
      ...sample(Object.values(data.drops), 8).map((c) => ["drops", c] as const),
      data.drops["nargacuga/g-rank"] && (["drops", data.drops["nargacuga/g-rank"]] as const),
      ...sample(Object.values(data.weapons), 120).map((c) => ["weapons", c] as const),
      ...sample(Object.values(data.items), 150).map((c) => ["items", c] as const),
      ["weapons", data.weapons["bow/hunter-s-bow-ii"]!],
      ["weapons", data.weapons["heavy-bowgun/bone-shooter"]!],
      ["weapons", data.weapons["hunting-horn/lava-alphorn"]!],
    ];
    for (const [kind, card] of cards.filter((c) => !!c)) {
      const svg = await draw(kind, card);
      assert.match(svg, /^<svg/, `${kind} ${"name" in card ? card.name : card.monster}`);
    }
  });
});
