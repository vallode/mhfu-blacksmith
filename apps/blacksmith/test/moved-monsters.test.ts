import assert from "node:assert/strict";
import { test } from "node:test";
import { readData } from "game-data";
import { MOVED_MONSTER_SLUGS, movedMonsterSlug } from "../src/lib/moved-monsters";
import { DATA_DIR, GAME } from "../src/lib/paths";
import { slugify } from "../src/lib/slug";

test("moved monster slugs lead to a current page and are no page of their own", () => {
  for (const [category, moves] of Object.entries(MOVED_MONSTER_SLUGS)) {
    const slugs = new Set(
      (readData(DATA_DIR, GAME, "monsters", `${category}.json`).monsters as { name: string }[]).map(
        (m) => slugify(m.name),
      ),
    );
    for (const [from, to] of Object.entries(moves ?? {})) {
      assert.ok(slugs.has(to), `${category}/${to} is a monster page`);
      assert.ok(!slugs.has(from), `${category}/${from} is still a monster page`);
    }
  }
  assert.equal(movedMonsterSlug("elder-dragon", "ashen-lao-shan-lung"), "ash-lao-shan-lung");
  assert.equal(movedMonsterSlug("elder-dragon", "ash-lao-shan-lung"), null);
  assert.equal(movedMonsterSlug("carapaceon", "terra-sceanataur"), "terra-s-ceanataur");
});
