/**
 * Whetstone's entry in the START menus, the quest's and the village's
 * (`blob/menu.c`): each menu's last entry, a greyed placeholder, becomes a
 * window of settings that features add to it, which the player can change
 * in game. It runs on hook 8 (`game-hooks.ts`: each menu's label, choose,
 * run and draw calls), drawn like the village's Options with the game's
 * own list window and arrows, and the text and window routines of the
 * Hunter's Pact.
 *
 * The menu is linked in with any feature that has a setting (damage
 * numbers, so far), when this disc's menu code matches; without it, those
 * features keep the disc's setting.
 */
import { MENU_OBJECTS } from "../blob/menu-object.js";
import { decodeObjects } from "../blob/link.js";
import { MENU, findMenuSites, type HookSites, type MenuSites } from "./game-hooks.js";
import { findUnique, maskImmediates } from "./mips.js";
import { findTextExterns } from "./hud-text.js";

/**
 * The HUD's list window, `box(hud, list, title, cursor, alpha, names)`
 * (EU 0x0882F580, JP 0x0882F7C4): the frame for the list's style, its title
 * on a light bar, a cursor bar on row `cursor` (none for -1), the lines
 * between rows (styles 2 and 3) and the rows' names, by `names`: 3 reads
 * them as string pointers, the others as message IDs for one of the
 * game's getters. The START menu and Options draw with it. Masked.
 */
export const BOX_SIGNATURE = [
  0x27bdffc0, 0xafbf003c, 0xafbe0038, 0xafb70034, 0xafb60030, 0xafb5002c, 0xafb40028, 0xafb30024,
  0xafb20020, 0xafb1001c, 0xafb00018, 0x90a2000b, 0x00c08021, 0x00e08821, 0x305e000f, 0x2fc10007,
  0x0120b021, 0x00809021, 0x10200016, 0x00a0a021,
].map(maskImmediates);
/**
 * The pulsing green arrows either side of a choice, `arrows(hud, x, y, w,
 * alpha)` (EU 0x0882E6F0, JP 0x0882E934), as the village's Options draws
 * them on its cursor's row. Masked: it reads the frame counter.
 */
export const ARROWS_SIGNATURE = [
  0x27bdffe0, 0xafbf000c, 0x3c0208a6, 0x3c0100f7, 0x8c4231a0, 0x3421a554, 0x00411021, 0x8c420000,
  0x3042003f, 0x00021280, 0x3042ffff, 0x04400004,
].map(maskImmediates);

/** The menu's sites and the blob's externs, or why they can't be found. */
export function prepareMenu(
  vanillaEboot: Buffer,
  sites: HookSites,
): { sites: MenuSites[]; externs: Record<string, number> } | string {
  const menu = findMenuSites(vanillaEboot, sites.segment);
  if (typeof menu === "string") return menu;
  const text = findTextExterns(vanillaEboot, sites);
  if (typeof text === "string") return text;
  const [box, arrows] = findUnique(
    vanillaEboot,
    sites.segment,
    [BOX_SIGNATURE, ARROWS_SIGNATURE],
    maskImmediates,
  );
  if (box == null || arrows == null) return "this EBOOT's list window code doesn't match";
  return {
    sites: menu,
    externs: {
      rf_window: text.rf_window!,
      rf_box: box,
      rf_arrows: arrows,
      rf_printer: text.rf_printer!,
      rf_print: text.rf_print!,
      rf_quest_menu_id: menu[MENU.quest]!.placeholder,
      rf_village_menu_id: menu[MENU.village]!.placeholder,
    },
  };
}

export const menuObjects = () => decodeObjects(MENU_OBJECTS);
