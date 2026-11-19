/**
 * Which `emNN.ovl` holds a species' code and data. Every `emNN.ovl` loads at
 * one address, so a pointer alone doesn't say which file it is in. Most
 * species use their own, by emID; the ones that don't are listed here.
 */

/**
 * Species whose code and data are in another family's `emNN.ovl`, by emID.
 * Basarios (22) and Black Gravios (47) run Gravios's class in em17; their
 * chunk pointers also read in em83, so the address alone doesn't tell.
 * Found from the species class vtables (randomfu `docs/monster-ai.md`).
 */
export const FAMILY_OVERLAY: ReadonlyMap<number, number> = new Map([
  [22, 17],
  [47, 17],
]);

/** The emID of the `emNN.ovl` to look in first for a species: its family's, or its own. */
export const familyOverlayId = (emId: number): number => FAMILY_OVERLAY.get(emId) ?? emId;
