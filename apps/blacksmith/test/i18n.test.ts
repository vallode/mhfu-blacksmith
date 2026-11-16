/**
 * The site's languages (lib/i18n): browser language detection, game text
 * fallback, and that every dictionary has every entry the English one has.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { detectLocale } from "../src/lib/i18n/locales";
import { gameText, ENGLISH } from "../src/lib/i18n/game-text";
import { MESSAGES } from "../src/lib/i18n/messages";
import { englishNames } from "../scripts/lib/locales";
import { DATA_DIR } from "../src/lib/paths";

describe("detectLocale", () => {
  test("matches the primary subtag", () => {
    assert.equal(detectLocale(["es-MX", "en"]), "es");
    assert.equal(detectLocale(["ES"]), "es");
  });
  test("takes the first language the site has", () => {
    assert.equal(detectLocale(["ja-JP", "es", "en"]), "es");
  });
  test("falls back to English", () => {
    assert.equal(detectLocale([]), "en");
    assert.equal(detectLocale(["ja-JP"]), "en");
  });
});

describe("gameText", () => {
  const es = gameText({
    item: { Potion: "Poción" },
    quest: { "10101": { title: "Título" } },
  });
  test("translates what the locale has", () => {
    assert.equal(es.name("item", "Potion"), "Poción");
    assert.equal(es.quest(10101, "title", "Title"), "Título");
  });
  test("falls back to English for the rest", () => {
    assert.equal(es.name("item", "Mega Potion"), "Mega Potion");
    assert.equal(es.name("weapon", "Potion"), "Potion");
    assert.equal(es.quest(10101, "goal", "Goal"), "Goal");
    assert.equal(es.quest(2, "title", "Other"), "Other");
  });
  test("no locale file means English", () => {
    assert.equal(gameText(null), ENGLISH);
  });
});

/** Every key path, with "fn" for function entries. */
function shape(node: unknown, path = ""): string[] {
  if (typeof node === "function") return [`${path}:fn`];
  if (typeof node === "string") return [`${path}:string`];
  if (node && typeof node === "object") {
    return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) =>
      shape(v, path ? `${path}.${k}` : k),
    );
  }
  return [`${path}:${typeof node}`];
}

describe("messages", () => {
  const english = shape(MESSAGES.en).sort();
  for (const [locale, messages] of Object.entries(MESSAGES)) {
    test(`${locale} has the same entries as English`, () => {
      assert.deepEqual(shape(messages).sort(), english);
    });
    test(`${locale} has no empty strings`, () => {
      const empty: string[] = [];
      const walk = (node: unknown, path: string) => {
        if (node === "") empty.push(path);
        else if (node && typeof node === "object") {
          for (const [k, v] of Object.entries(node)) walk(v, `${path}.${k}`);
        }
      };
      walk(messages, locale);
      assert.deepEqual(empty, []);
    });
  }
});

describe("englishNames", () => {
  const names = englishNames(DATA_DIR);
  test("collects each kind's English names from data/", () => {
    assert.ok(names.weapon.has("Hunter's Bow I"));
    assert.ok(names.armor.has("Mafumofu Hood"));
    assert.ok(names.decoration.has("Attack Jewel"));
    assert.ok(names.monster.has("Felyne"));
    assert.ok(names.item.has("Potion"));
    assert.ok(names.skill.has("Attack Up (Large)"));
    assert.ok(names.skill.has("Cold Res"));
    assert.ok(names.map.has("Snowy Mountains (Day)"));
  });
});
