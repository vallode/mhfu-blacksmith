/** La interfaz en español. Typed against `Messages`, so a missing key fails `tsc`. */
import type { Messages } from "../en";
import { common } from "./common";
import { site } from "./site";
import { equipment } from "./equipment";
import { monsters } from "./monsters";
import { quests } from "./quests";
import { setBuilder } from "./set-builder";
import { items } from "./items";

export const es: Messages = { common, site, equipment, monsters, quests, setBuilder, items };
