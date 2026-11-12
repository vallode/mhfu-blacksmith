/**
 * The English interface text: the source dictionary every other language
 * copies the shape of (`Messages`). Strings are plain values; text that
 * needs numbers or a link inside it is a function.
 */
import { common } from "./common";
import { site } from "./site";
import { equipment } from "./equipment";
import { monsters } from "./monsters";
import { quests } from "./quests";
import { setBuilder } from "./set-builder";
import { items } from "./items";

export const en = { common, site, equipment, monsters, quests, setBuilder, items };

export type Messages = typeof en;
