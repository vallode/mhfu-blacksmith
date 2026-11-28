/**
 * The HUD's text, window, fill and icon routines, found by code signatures
 * on the EU and JP (FUC) discs: what blob code that draws its own windows
 * (the START menu entry, damage numbers, Hunter's Pact) calls. `pact.ts` in
 * randomfu describes what each does in the game.
 */
import type { HookSites } from "./game-hooks.js";
import { findUnique, hiLo, jumpTarget, maskWord } from "./mips.js";

/**
 * The printer's setters, exact: position (`+0x120`, `+0x122`), layer
 * (`+0x12F`, 0 to 5), colour (`+0x12E`) and `+0x15F`. The pact writes the
 * layer itself; these show the offsets hold on the disc.
 */
export const TEXT_SETTERS = [
  0xa4850120, 0x03e00008, 0xa4860122, 0x7c051c20, 0x04630003, 0x7c051c20, 0x00002821, 0x7c051c20,
  0x28630006, 0x54600003, 0xa085012f, 0x24050005, 0xa085012f, 0x03e00008, 0x00000000, 0x03e00008,
  0xa085012e,
];
/** `window`'s call to the code-reading print, from its start. */
const WINDOW_PRINT_CALL = 0xfc;
/**
 * The HUD's translucent fill (EU 0x0882D8DC, JP 0x0882DB20), exact: colour
 * bytes to RGBA, then the display list header it builds.
 */
export const FILL_SIGNATURE = [
  0x27bdffb0, 0x314300ff, 0x312900ff, 0x00031a00, 0x01234825, 0x316300ff, 0x00031c00, 0x00695025,
  0x30a9ffff, 0x3103ffff, 0x30c5ffff, 0x00a31821, 0x00033400, 0x24030008, 0xafa30014, 0x3c031e00,
  0xafa30030, 0x3c035000, 0x34630001, 0xafa30034, 0x3c031280, 0x3463011c, 0xafa30038, 0x3c030406,
];
/**
 * The HUD's window routine, masked: `window(hud, rect, text, alpha)` draws a
 * framed box (the item-received card's, frame style 0) and sets the printer's
 * glyph size and colour from the rect (EU 0x0882FC50, JP 0x0882FE94).
 */
export const WINDOW_SIGNATURE = [
  0x27bdfff0, 0xafbf0000, 0xafb10000, 0xafb00000, 0x90a3000b, 0x24020000, 0x00c08021, 0x00e04821,
  0x1062001c, 0x00a08821, 0x24020000, 0x50620013, 0x96250000, 0x24020000, 0x1062000f, 0x00000000,
  0x24020000, 0x50620006, 0x96250000, 0x10600003, 0x00000000, 0x10000014, 0x00000000, 0x96250000,
  0x96270004, 0x96280006, 0x0c000000, 0x96260002,
];

/**
 * The HUD's item icon routine, `itemIcon(hud, item, x, y, w, h, marks,
 * alpha)` (EU 0x0882E2C0, JP 0x0882E504): the item's icon shape from the
 * item table (`+5`), tinted with its colour (`+6`), the 16x16 sprite below
 * a width of 21 and the 24x24 one from it, its top left at x, y. The pouch
 * and item box call it with `marks` 1, which adds their overlays (the ammo
 * the gun can't load); 0 draws the icon alone. Masked, from `+0x40`: the
 * words before load the item table's address, which differs by disc.
 */
export const ITEM_ICON_SIGNATURE = [
  0x00658821, 0xafb00000, 0x92250005, 0x24030000, 0x00c0a021, 0x00e09821, 0x01009021, 0xa7a9004e,
  0xa3aa004d, 0x0160b021, 0x10a30078, 0x0080a821, 0x0c000000, 0x24050000, 0x92250005, 0x3250ffff,
  0x2a060015, 0x0c000000, 0x02a02021, 0x92240006, 0x87a3004e, 0x7c12f620, 0xafb60000, 0xafa20000,
];
/** Where `ITEM_ICON_SIGNATURE` starts in the routine, after its first `addiu sp, sp, -0x50`. */
export const ITEM_ICON_SIGNATURE_AT = 0x40;
const ITEM_ICON_PROLOGUE = 0x27bdffb0;
/**
 * The HUD's equipment icon routine, `equipmentIcon(hud, type, id, x, y, w,
 * h, alpha, dim)` (EU 0x08831338, JP 0x08831460), masked: a piece by its
 * equipment box type and ID, its shape for its slot or weapon class (16x16
 * below a width of 24), tinted with its rarity's colour (`dim`, on the
 * stack, picks a dimmer set).
 */
export const EQUIPMENT_ICON_SIGNATURE = [
  0x27bdffc0, 0xafbf0000, 0xafb60000, 0xafb50000, 0xafb40000, 0xafb30000, 0xafb20000, 0xafb10000,
  0xafb00000, 0x01209821, 0x3262ffff, 0x28500018, 0xa3a50035, 0xa7a60036, 0x0080b021, 0x3c020000,
  0x8c440000, 0x00e0a821, 0x0100a021, 0x01409021, 0x01608821, 0x30a500ff, 0x0c000000, 0x30c6ffff,
  0x93a70040, 0x02203021, 0x304500ff, 0x0c000000, 0x02c02021, 0x02003021, 0xafa20000, 0x02c02021,
];

const word = (buf: Buffer, at: number) => buf.readUInt32LE(at);

/** The text externs, or why they can't be found. */
export function findTextExterns(
  vanillaEboot: Buffer,
  sites: HookSites,
): Record<string, number> | string {
  const { segment } = sites;
  const at = (vaddr: number) => word(vanillaEboot, segment.offset + (vaddr - segment.vaddr));
  const [setters, window, fill, iconBody, equipmentIcon] = findUnique(vanillaEboot, segment, [
    TEXT_SETTERS.map(maskWord),
    WINDOW_SIGNATURE,
    FILL_SIGNATURE.map(maskWord),
    ITEM_ICON_SIGNATURE,
    EQUIPMENT_ICON_SIGNATURE,
  ]);
  if (setters == null) return "this EBOOT's text code doesn't match";
  if (window == null || fill == null) return "this EBOOT's window code doesn't match";
  const itemIcon = iconBody == null ? null : iconBody - ITEM_ICON_SIGNATURE_AT;
  if (itemIcon == null || at(itemIcon) !== ITEM_ICON_PROLOGUE) {
    return "this EBOOT's item icon code doesn't match";
  }
  if (equipmentIcon == null) return "this EBOOT's equipment icon code doesn't match";
  const printCall = at(window + WINDOW_PRINT_CALL);
  if (printCall >>> 26 !== 0x03) return "this EBOOT's window code doesn't match";
  // After `jal padRead`: `lui v0, hi; jal reset; lw a0, lo(printer)(v0)`.
  const lui = at(sites.pad + 8);
  const lw = at(sites.pad + 16);
  if (lui >>> 26 !== 0x0f || lw >>> 26 !== 0x23 || at(sites.pad + 12) >>> 26 !== 0x03) {
    return "this EBOOT's main loop doesn't match";
  }
  return {
    rf_printer: hiLo(lui, lw),
    rf_print: jumpTarget(printCall, window + WINDOW_PRINT_CALL),
    rf_window: window,
    rf_fill: fill,
    rf_item_icon: itemIcon,
    rf_equipment_icon: equipmentIcon,
    // `lui v0, hi; jal padRead; lw a0, lo(pad)(v0)`: the pad object's global.
    rf_pad: hiLo(at(sites.pad - 4), at(sites.pad + 4)),
  };
}
