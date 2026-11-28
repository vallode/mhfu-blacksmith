/**
 * Writes the weapon files for the mhfu_weapon_information.zip release:
 * data/mhfu/weapons/*.json in their named view (readData), with names where the
 * files hold IDs, as the release has always had them.
 */
import fs from "fs";
import path from "path";
import { readData, serializeData } from "game-data";
import { DATA_DIR, GAME, GAME_DATA_DIR } from "../src/lib/paths";

const out = path.join(process.cwd(), "mhfu_weapon_information");
fs.mkdirSync(out, { recursive: true });
for (const file of fs
  .readdirSync(path.join(GAME_DATA_DIR, "weapons"))
  .filter((f) => f.endsWith(".json")))
  fs.writeFileSync(path.join(out, file), serializeData(readData(DATA_DIR, GAME, "weapons", file)));
