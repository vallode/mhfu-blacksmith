"use client";

import Icon from "./Icon";
import { useT } from "@/context/LanguageContext";

/**
 * Shot sprite (item-26) and tint (an index into `--color-item-*`) per ammo, as
 * the game's item table gives them. Keys are the weapon data's names.
 */
const AMMO_TINT: Record<string, number> = {
  "Normal S": 0,
  "Pierce S": 0,
  "Pellet S": 0,
  "Crag S": 0,
  "Clust S": 0,
  RecovS: 2,
  PoisnS: 5,
  "Para S": 4,
  SleepS: 6,
  "Flame S": 1,
  "Water S": 6,
  ThunderS: 4,
  "Freeze S": 3,
  "Dragon S": 1,
  "Tranq S": 1,
  "Paint S": 8,
  "Demon S": 1,
  "Armor S": 7,
};

/** An ammo table's name cell: the shot icon, then the name. */
export default function AmmoName({ name }: { name: string }) {
  const t = useT();
  const tint = AMMO_TINT[name];
  return (
    <td>
      <div className="flex items-center">
        {tint !== undefined && <Icon type="item-26" color={`item-${tint}`} />}
        {t.equipment.weapon.ammo[name] ?? name}
      </div>
    </td>
  );
}
