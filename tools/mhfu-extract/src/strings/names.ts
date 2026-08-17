/**
 * English name resolution for equipment/item/monster IDs.
 *
 * The equipment structs in EBOOT.BIN carry no name pointer of their own —
 * names live in separate string/pointer tables the vendored patterns don't
 * document (`amaillo/MH-Pointers-Tool` edits exactly these tables and is
 * the lead to follow for locating them). Until that pointer table's address
 * is confirmed against a real EBOOT dump, this module bootstraps names from
 * the MIT-licensed `.enum` files in mhp2g-patterns, which is itself
 * hand-transcribed (third-party, not extracted) data.
 *
 * This is intentionally the *only* place in the pipeline that resolves a
 * numeric ID to a display name, so swapping the bootstrap source for a real
 * disc-extracted string table later is a one-function change — everything
 * else in tables/ works with raw IDs and calls into this module.
 */
import { loadEnums, lookupName } from "./enums.js";

export type NameTable =
  | "HeadArmorID"
  | "ChestArmorID"
  | "ArmArmorID"
  | "WaistArmorID"
  | "LegArmorID"
  | "WepBMID"
  | "WepGunID"
  | "AncRustID"
  | "SkillID"
  | "BowChargeID"
  | "ItemID"
  | "emID";

export interface NameResolver {
  resolve(table: NameTable, index: number): string | null;
  source: "mhp2g-patterns-enum" | "disc-extracted";
}

class EnumBootstrapResolver implements NameResolver {
  readonly source = "mhp2g-patterns-enum" as const;
  private readonly enums = loadEnums();

  resolve(table: NameTable, index: number): string | null {
    return lookupName(this.enums, table, index);
  }
}

let defaultResolver: NameResolver | null = null;

export function getNameResolver(): NameResolver {
  if (!defaultResolver) defaultResolver = new EnumBootstrapResolver();
  return defaultResolver;
}
