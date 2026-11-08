import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { CATEGORIES } from "../src/build/categories.js";
import { compareCategory, loadInputs } from "../src/build/compare.js";
import { canonical, percentValue, toSite, type FieldContext } from "../src/build/fields.js";
import { assignDiscIds, discMaterialId, loadSiteIndex } from "../src/build/ids.js";
import { mergeCategory, serializeDataFile } from "../src/build/merge.js";
import { runBuildData } from "../src/cli/build-data.js";

// Real enum IDs from the vendored mhp2g-patterns tables.
const LEATHER_HELM = 1;
const CHAIN_HELM = 2;
const IRON_ORE = 202;
const KELBI_HIDE = 328;

const helmetIds = [null, { name: "Leather Helm" }, { name: "Chain Helm (site name)" }];
const equipmentIds = {
  leggings: [],
  helmet: helmetIds,
  plate: [],
  gauntlets: [],
  waist: [],
  melee: [],
  ranged: [],
};
const items = {
  items: [
    { id: IRON_ORE, name: "Iron Ore", name_jp: "" },
    { id: KELBI_HIDE, name: "Kelbi Hide", name_jp: "" },
  ],
};

const committedHelmets = {
  armor: [
    {
      name: "Chain Helm (site name)",
      type: "helmet",
      hr: "1",
      defence: 4,
      sex: "Male/Female",
      rarity: 1,
      slots: 0,
      skills: [
        { name: "Defence", amount: 2 },
        { name: "Load", amount: 1 },
      ],
      create_mats: [{ name: "iron  ore", amount: 2, type: "ore", color: "gray" }],
      rank: "low-rank",
    },
    {
      name: "Leather Helm",
      type: "helmet",
      hr: "1",
      defence: 2,
      rarity: 1,
      slots: 0,
      skills: null,
      create_mats: [{ name: "Kelbi Hide", amount: 1, type: "pelt", color: "blue" }],
      rank: "low-rank",
    },
    { name: "Site Only Helm", type: "helmet", defence: 1, rarity: 1, slots: 0, rank: "low-rank" },
  ],
};

/** Disc output for the same helmets, in extractor vocabulary and ID order. */
const extractedHelmets = {
  armor: [
    {
      name: "Leather Helm",
      type: "helmet",
      rank: "low-rank",
      rarity: 1,
      slots: 1, // disagrees
      defence: 2,
      skills: null,
      create_mats: [{ name: "Kelbi Hide", amount: 1, type: "pelt", color: "blue" }],
    },
    {
      name: "Chain Helm",
      type: "helmet",
      rank: "low-rank",
      rarity: 1,
      slots: 0,
      defence: 4,
      // Same skills as the site, other order and MHP2G spelling.
      skills: [
        { name: "Reload", amount: 1 },
        { name: "Defense", amount: 2 },
      ],
      create_mats: [{ name: "Iron Ore", amount: 2, type: "ore", color: "gray" }],
    },
  ],
};

/** Chain Helm after a merge: the disc's skill order, in the site's spelling. */
const mergedChainHelm = {
  ...committedHelmets.armor[0],
  skills: [
    { name: "Load", amount: 1 },
    { name: "Defence", amount: 2 },
  ],
};

async function fixture(): Promise<{ root: string; data: string; extracted: string }> {
  const root = await mkdtemp(path.join(tmpdir(), "mhfu-extract-build-"));
  const data = path.join(root, "data");
  const extracted = path.join(root, "extracted");
  await mkdir(path.join(data, "armor"), { recursive: true });
  await mkdir(path.join(extracted, "armor"), { recursive: true });
  await mkdir(path.join(extracted, "quests"), { recursive: true });
  await writeFile(path.join(data, "equipment-ids.json"), JSON.stringify(equipmentIds));
  await writeFile(path.join(data, "items.json"), JSON.stringify(items));
  await writeFile(
    path.join(data, "armor", "helmet.json"),
    JSON.stringify(committedHelmets, null, 2),
  );
  await writeFile(
    path.join(extracted, "armor", "helmet.json"),
    JSON.stringify(extractedHelmets, null, 2),
  );
  await writeFile(
    path.join(extracted, "quests", "village.json"),
    JSON.stringify({ quests: [{ id: 1 }] }),
  );
  return { root, data, extracted };
}

test("assignDiscIds recovers IDs from enum names, pairing repeated names by order", () => {
  assert.deepEqual(assignDiscIds(["Leather Helm", "Chain Helm", "Not An Armor"], "HeadArmorID"), [
    LEATHER_HELM,
    CHAIN_HELM,
    null,
  ]);
  // Red Guild Guard Suit is ChestArmorID 172 and 174.
  assert.deepEqual(
    assignDiscIds(
      ["Red Guild Guard Suit", "Red Guild Guard Suit", "Red Guild Guard Suit"],
      "ChestArmorID",
    ),
    [172, 174, null],
  );
});

test("discMaterialId inverts the recipe-context item name correction", () => {
  assert.equal(discMaterialId("Iron Ore", "armor"), IRON_ORE);
  assert.equal(discMaterialId("Definitely Not An Item", "weapon"), null);
});

test("site index resolves equipment through equipment-ids.json and items loosely", async () => {
  const { root, data } = await fixture();
  try {
    const site = loadSiteIndex(data);
    assert.equal(site.equipmentIdOf("helmet", { name: "Chain Helm (site name)" }), CHAIN_HELM);
    assert.equal(site.equipmentIdOf("helmet", { name: "Unknown" }), null);
    assert.equal(site.itemIdOf("IRON ORE"), IRON_ORE);
    assert.equal(site.itemIdOf("KelbiHide"), KELBI_HIDE);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("compareCategory pairs renamed items by ID and ignores skill order and spelling", async () => {
  const { root, data, extracted } = await fixture();
  try {
    const inputs = await loadInputs(extracted, data, ["armor"]);
    const result = compareCategory(
      CATEGORIES.armor,
      inputs.extracted.get("armor")!,
      inputs.committed.get("armor")!,
      inputs.site,
      inputs.spellings,
    );
    const helmet = result.files.find((f) => f.file === "armor/helmet.json")!;
    assert.equal(helmet.matched, 2);
    assert.equal(helmet.siteOnly, 1);
    assert.equal(helmet.discOnly, 0);
    const field = (name: string) => helmet.fields.find((f) => f.field === name)!;
    assert.deepEqual(field("skills"), { field: "skills", agree: 2, disagree: 0, siteMissing: 0 });
    assert.deepEqual(field("create_mats"), {
      field: "create_mats",
      agree: 2,
      disagree: 0,
      siteMissing: 0,
    });
    assert.deepEqual(field("slots"), { field: "slots", agree: 1, disagree: 1, siteMissing: 0 });
    assert.deepEqual(result.disagreements, [
      {
        file: "armor/helmet.json",
        name: "Leather Helm",
        id: LEATHER_HELM,
        field: "slots",
        site: 0,
        disc: 1,
      },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("mergeCategory takes disc values in disc order, keeps site-only fields and item order", async () => {
  const { root, data, extracted } = await fixture();
  try {
    const inputs = await loadInputs(extracted, data, ["armor"]);
    const result = mergeCategory(
      CATEGORIES.armor,
      inputs.extracted.get("armor")!,
      inputs.committed.get("armor")!,
      inputs.site,
      inputs.spellings,
      [],
    );
    const merged = result.files.get("armor/helmet.json")!;
    // Order, names, and fields the disc lacks are the committed ones.
    assert.deepEqual(
      merged.map((i) => i.name),
      ["Chain Helm (site name)", "Leather Helm", "Site Only Helm"],
    );
    // Skills that agree as a set are still rewritten in the disc's order.
    assert.deepEqual(merged[0], mergedChainHelm);
    assert.deepEqual(merged[1], { ...committedHelmets.armor[1], slots: 1 });
    assert.deepEqual(merged[2], committedHelmets.armor[2]);
    assert.deepEqual(Object.keys(merged[1]!), Object.keys(committedHelmets.armor[1]!));
    assert.deepEqual(result.changes, [
      {
        file: "armor/helmet.json",
        name: "Chain Helm (site name)",
        id: CHAIN_HELM,
        field: "skills",
        before: committedHelmets.armor[0]!.skills,
        after: mergedChainHelm.skills,
      },
      {
        file: "armor/helmet.json",
        name: "Leather Helm",
        id: LEATHER_HELM,
        field: "slots",
        before: 0,
        after: 1,
      },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("mergeCategory keeps a file's keepFields as committed", async () => {
  const { root, data, extracted } = await fixture();
  try {
    const inputs = await loadInputs(extracted, data, ["armor"]);
    const category = {
      ...CATEGORIES.armor,
      files: CATEGORIES.armor.files.map((f) =>
        f.file === "armor/helmet.json" ? { ...f, keepFields: ["slots", "skills"] } : f,
      ),
    };
    const result = mergeCategory(
      category,
      inputs.extracted.get("armor")!,
      inputs.committed.get("armor")!,
      inputs.site,
      inputs.spellings,
      [],
    );
    // Leather Helm's disc slots (1) disagree with the site (0) but aren't taken.
    assert.deepEqual(result.files.get("armor/helmet.json")![1], committedHelmets.armor[1]);
    assert.deepEqual(result.changes, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("every weapon file takes elements", () => {
  assert.ok(CATEGORIES.weapons.take.includes("elements"));
  assert.ok(CATEGORIES.weapons.files.every((f) => !f.keepFields?.includes("elements")));
});

test("mergeCategory writes new skills and materials in the site's spelling", async () => {
  const { root, data, extracted } = await fixture();
  try {
    const disc = structuredClone(extractedHelmets);
    disc.armor[1]!.skills = [
      { name: "Defense", amount: 3 },
      { name: "Reload", amount: 1 },
      { name: "Capacity", amount: 2 },
    ];
    disc.armor[0]!.create_mats = [
      { name: "Kelbi Hide", amount: 1, type: "pelt", color: "blue" },
      { name: "Iron Ore", amount: 5, type: "ore", color: "gray" },
    ];
    await writeFile(path.join(extracted, "armor", "helmet.json"), JSON.stringify(disc));
    const inputs = await loadInputs(extracted, data, ["armor"]);
    const result = mergeCategory(
      CATEGORIES.armor,
      inputs.extracted.get("armor")!,
      inputs.committed.get("armor")!,
      inputs.site,
      inputs.spellings,
      [],
    );
    const [chain, leather] = result.files.get("armor/helmet.json")!;
    // Disc order in the committed spellings; a skill new to the item gets
    // the MHP2G name when no committed item spells it otherwise.
    assert.deepEqual(chain!.skills, [
      { name: "Defence", amount: 3 },
      { name: "Load", amount: 1 },
      { name: "Capacity", amount: 2 },
    ]);
    // "Iron Ore" is spelled the way the committed data spells item 202.
    assert.deepEqual(leather!.create_mats, [
      { name: "Kelbi Hide", amount: 1, type: "pelt", color: "blue" },
      { name: "iron  ore", amount: 5, type: "ore", color: "gray" },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("mergeCategory keeps reviewed site values and rejects stale overrides", async () => {
  const { root, data, extracted } = await fixture();
  try {
    const inputs = await loadInputs(extracted, data, ["armor"]);
    const args = [
      CATEGORIES.armor,
      inputs.extracted.get("armor")!,
      inputs.committed.get("armor")!,
      inputs.site,
      inputs.spellings,
    ] as const;
    const keep = {
      file: "armor/helmet.json",
      name: "Leather Helm",
      field: "slots",
      reason: "test",
    };
    const result = mergeCategory(...args, [keep]);
    assert.equal(result.files.get("armor/helmet.json")![1]!.slots, 0);
    assert.deepEqual(
      result.changes.filter((c) => c.name === "Leather Helm"),
      [],
    );
    assert.deepEqual(result.kept, [{ ...keep, disc: 1 }]);

    assert.throws(() => mergeCategory(...args, [{ ...keep, field: "defence" }]), /no longer match/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("runBuildData rewrites data/ in the committed layout and copies quests", async () => {
  const { root, data, extracted } = await fixture();
  try {
    const report = await runBuildData({ extracted, data, only: ["armor", "quests"] });
    assert.deepEqual(report.categories[0]!.filesWritten, ["armor/helmet.json"]);
    assert.deepEqual(report.questFiles, [path.join("quests", "village.json")]);

    const written = await readFile(path.join(data, "armor", "helmet.json"), "utf-8");
    const expected = {
      armor: [
        mergedChainHelm,
        { ...committedHelmets.armor[1], slots: 1 },
        committedHelmets.armor[2],
      ],
    };
    assert.equal(
      written,
      serializeDataFile("armor", null, expected.armor as Record<string, unknown>[]),
    );
    assert.ok(!written.endsWith("\n"));
    assert.deepEqual(
      JSON.parse(await readFile(path.join(data, "quests", "village.json"), "utf-8")),
      { quests: [{ id: 1 }] },
    );

    // A second run is a no-op.
    const again = await runBuildData({ extracted, data, only: ["armor"] });
    assert.deepEqual(again.categories[0]!.filesWritten, []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("mergeCategory writes a skill the committed list repeats once", async () => {
  const { root, data, extracted } = await fixture();
  try {
    const committed = structuredClone(committedHelmets);
    committed.armor[0]!.skills = [
      { name: "Defence", amount: 2 },
      { name: "Defence", amount: 2 },
      { name: "Load", amount: 1 },
    ];
    await writeFile(path.join(data, "armor", "helmet.json"), JSON.stringify(committed));
    const inputs = await loadInputs(extracted, data, ["armor"]);
    const result = mergeCategory(
      CATEGORIES.armor,
      inputs.extracted.get("armor")!,
      inputs.committed.get("armor")!,
      inputs.site,
      inputs.spellings,
      [],
    );
    assert.deepEqual(result.files.get("armor/helmet.json")![0]!.skills, [
      { name: "Load", amount: 1 },
      { name: "Defence", amount: 2 },
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("percent fields compare by number and keep the committed spelling when they agree", () => {
  const spec = { field: "affinity", kind: "percent" as const };
  const ctx = {} as FieldContext;
  assert.equal(percentValue("0"), 0);
  assert.equal(percentValue("-10%"), -10);
  assert.equal(percentValue("15 %"), 15);
  assert.equal(percentValue("n/a"), null);
  assert.equal(canonical(spec, "0", "site", ctx), canonical(spec, "0%", "disc", ctx));
  assert.notEqual(canonical(spec, "10%", "site", ctx), canonical(spec, "5%", "disc", ctx));
  assert.equal(toSite(spec, "0%", { affinity: "0" }, ctx), "0");
  assert.equal(toSite(spec, "-5%", { affinity: "0" }, ctx), "-5%");
  assert.equal(toSite(spec, 20, { affinity: "10%" }, ctx), "20%");
});

test("ammo lists compare by ammo name and rapid fire as a trimmed set", () => {
  const ctx = {} as FieldContext;
  const ammo = { field: "ammo", kind: "ammo" as const };
  const site = [
    { name: "Normal S", capacity: [6, 6, 0] },
    { name: "Pierce S ", capacity: [3, 0, 0] },
  ];
  const disc = [
    { name: "Pierce S", capacity: [3, 0, 0] },
    { name: "Normal S", capacity: [6, 6, 0] },
  ];
  assert.equal(canonical(ammo, site, "site", ctx), canonical(ammo, disc, "disc", ctx));
  assert.notEqual(
    canonical(ammo, site, "site", ctx),
    canonical(ammo, [{ name: "Normal S", capacity: [6, 6, 9] }, disc[0]], "disc", ctx),
  );

  const rapid = { field: "rapid_fire", kind: "joined-set" as const };
  assert.equal(
    canonical(rapid, "Pellet S Lv1|Pierce S Lv2 ", "site", ctx),
    canonical(rapid, "Pierce S Lv2|Pellet S Lv1", "disc", ctx),
  );
  assert.equal(canonical(rapid, null, "site", ctx), canonical(rapid, "", "disc", ctx));
  assert.equal(
    toSite(rapid, "Normal S Lv1|Flaming S", { rapid_fire: "Normal S Lv1|Flaming" }, ctx),
    "Normal S Lv1|Flaming S",
  );
  // An agreeing list is still written in the disc's order and spelling.
  assert.equal(
    toSite(rapid, "Pierce S Lv2|Pellet S Lv1", { rapid_fire: "Pellet S Lv1|Pierce S Lv2 " }, ctx),
    "Pierce S Lv2|Pellet S Lv1",
  );
});

test("mergeCategory takes elements in bow and melee files alike", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "mhfu-extract-elements-"));
  try {
    const data = path.join(root, "data");
    const extracted = path.join(root, "extracted");
    for (const dir of [data, extracted])
      await mkdir(path.join(dir, "weapons"), { recursive: true });
    // Real enum IDs: WepBMID 1 "Carbalite Sword", WepGunID 1 "Shooter's Barrel".
    await writeFile(
      path.join(data, "equipment-ids.json"),
      JSON.stringify({
        ...equipmentIds,
        melee: [null, { name: "Carbalite Sword", type: "great-sword" }],
        ranged: [null, { name: "Shooter's Barrel", type: "bow" }],
      }),
    );
    await writeFile(path.join(data, "items.json"), JSON.stringify(items));
    const write = (dir: string, file: string, item: object) =>
      writeFile(path.join(dir, "weapons", file), JSON.stringify({ weapons: [item] }));
    await write(data, "bow.json", { name: "Shooter's Barrel", type: "bow", elements: null });
    await write(data, "great-sword.json", { name: "Carbalite Sword", elements: null });
    const poisonAdd = [{ name: "Poison", attack: "Add" }];
    await write(extracted, "bow.json", {
      name: "Shooter's Barrel",
      type: "bow",
      elements: poisonAdd,
    });
    await write(extracted, "great-sword.json", {
      name: "Carbalite Sword",
      elements: [{ name: "Fire", attack: 100 }],
    });

    const inputs = await loadInputs(extracted, data, ["weapons"]);
    const result = mergeCategory(
      CATEGORIES.weapons,
      inputs.extracted.get("weapons")!,
      inputs.committed.get("weapons")!,
      inputs.site,
      inputs.spellings,
      [],
    );
    assert.deepEqual(result.files.get("weapons/bow.json")![0]!.elements, poisonAdd);
    assert.deepEqual(result.files.get("weapons/great-sword.json")![0]!.elements, [
      { name: "Fire", attack: 100 },
    ]);
    assert.deepEqual(result.changes.map((c) => `${c.file} ${c.field}`).sort(), [
      "weapons/bow.json elements",
      "weapons/great-sword.json elements",
    ]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("set fields that agree are still written in the disc's order", () => {
  const spec = { field: "elements", kind: "set" as const };
  const ctx = {} as FieldContext;
  // Twin Nails: the disc stores Fire first, the site listed Ice first.
  const disc = [
    { name: "Fire", attack: 300 },
    { name: "Ice", attack: 300 },
  ];
  const site = { elements: [disc[1], disc[0]] };
  assert.equal(canonical(spec, site.elements, "site", ctx), canonical(spec, disc, "disc", ctx));
  assert.deepEqual(toSite(spec, disc, site, ctx), disc);
});

test("signed-number compares bonus by number and keeps the committed spelling", () => {
  const spec = { field: "bonus", kind: "signed-number" as const };
  const ctx = {} as FieldContext;
  assert.equal(canonical(spec, "10", "site", ctx), canonical(spec, "+10", "disc", ctx));
  assert.equal(canonical(spec, null, "site", ctx), canonical(spec, null, "disc", ctx));
  assert.notEqual(canonical(spec, null, "site", ctx), canonical(spec, "+14", "disc", ctx));
  assert.notEqual(canonical(spec, "+8", "site", ctx), canonical(spec, "+10", "disc", ctx));
  assert.equal(toSite(spec, "+10", { bonus: "10" }, ctx), "10");
  assert.equal(toSite(spec, "+14", { bonus: null }, ctx), "+14");
});

test("melodies compare as a set of whole melodies, combo order included", () => {
  const spec = { field: "melodies", kind: "melodies" as const };
  const ctx = {} as FieldContext;
  const ww = { combo: ["w", "w"], effect: "Movement Speed Up", duration: "3 mins" };
  const wr = { combo: ["w", "r"], effect: "Attack Up [Lo]", duration: "2 mins" };
  assert.equal(canonical(spec, [ww, wr], "site", ctx), canonical(spec, [wr, ww], "disc", ctx));
  const rw = { ...wr, combo: ["r", "w"] };
  assert.notEqual(canonical(spec, [ww, wr], "site", ctx), canonical(spec, [ww, rw], "disc", ctx));
  const longer = { ...wr, duration: "3 mins" };
  assert.notEqual(canonical(spec, [wr], "site", ctx), canonical(spec, [longer], "disc", ctx));
});
