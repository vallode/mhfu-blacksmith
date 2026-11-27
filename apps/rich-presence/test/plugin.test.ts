import assert from "node:assert/strict";
import { test } from "node:test";
import { loadNames, type Catalog } from "../src/names";
import { PLUGIN_INI, buildScript, luaString } from "../src/plugin";
import { SITE } from "../src/presence";

test("Lua string literals", () => {
  assert.equal(luaString('Say "hi"'), '"Say \\"hi\\""');
  assert.equal(luaString("a\\b\nc"), '"a\\\\b\\nc"');
  assert.equal(luaString("\x01\x7f9"), '"\\001\\1279"');
  assert.equal(luaString("G★3 · ティガレックス"), '"G★3 · ティガレックス"');
});

test("plugin.ini: a Lua plugin for both releases", () => {
  assert.match(PLUGIN_INI, /^type = lua$/m);
  assert.match(PLUGIN_INI, /^filename = presence\.lua$/m);
  assert.match(PLUGIN_INI, /^version = 1$/m);
  assert.match(PLUGIN_INI, /^state = none$/m);
  assert.match(PLUGIN_INI, /^ULES01213 = true$/m);
  assert.match(PLUGIN_INI, /^ULJM05500 = true$/m);
});

const tiny: Catalog = {
  ids: { quests: [3201], monsters: [70], weapons: [{ table: 5, id: 1 }], maps: [6] },
  quest: () => ({ title: 'The "Tigrex" Tamer', hub: "guild", rank: "g-rank" }),
  monster: () => ({ name: "Tigrex", slug: "tigrex" }),
  weapon: () => ({ name: "Buster Sword", type: "great-sword", rarity: 7 }),
  map: () => "Jungle (Day)",
};

test("the tables carry the names, labels and pictures", () => {
  const lua = buildScript(tiny);
  assert.ok(lua.includes('[3201] = "The \\"Tigrex\\" Tamer",'));
  assert.ok(lua.includes('[3201] = "guild/g-rank",'));
  // G rank is ★9-11 in the quest file.
  assert.ok(lua.includes('["guild/g-rank"] = { "Guild ★1", '));
  assert.ok(lua.includes('"G★1", "G★2", "G★3"'));
  assert.ok(lua.includes(`[70] = { "Tigrex", "${SITE}/embed/presence/monster-tigrex.png" },`));
  assert.ok(
    lua.includes(
      `[1] = { "${SITE}/embed/presence/great-sword-rarity-7.png", "Buster Sword (Great Sword)" },`,
    ),
  );
  // The Jungle's 6th stage is its area 9.
  assert.match(lua, /\[6\] = \{ name = "Jungle", areas = \{ 0, 1, 2, 3, 4, 5, 9,/);
  assert.ok(lua.includes('[139] = "In Pokke Village",'));
  assert.ok(lua.includes("ULES01213 = { hunter = 0x1196100, mapStages = 0x14E0708 },"));
  assert.ok(lua.trimEnd().endsWith("emu.every(60, update)"));
});

test("the real data makes a script with every quest, monster, weapon and map", () => {
  const names = loadNames();
  const lua = buildScript(names);
  assert.ok(names.ids.quests.length > 500);
  assert.ok(lua.includes('"Slay the Great Kut-Ku!"'));
  assert.ok(
    lua.includes(`[6] = { "Yian Kut-Ku", "${SITE}/embed/presence/monster-yian-kut-ku.png" },`),
  );
  assert.ok(lua.includes('"Buster Sword (Great Sword)"'));
  assert.ok(lua.includes('name = "Forest and Hills"'));
  assert.ok(lua.length < 1024 * 1024, `${lua.length} bytes`);
});
