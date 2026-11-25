"use client";

/**
 * A save-file set as "My sets" shows it: a summary row (its weapon and armor,
 * defence and active skills) and a read-only detail with the full equipment.
 */
import { useMemo } from "react";
import Icon from "@/components/Icon";
import Loading from "@/components/Loading";
import { useGameText, useLocale, useT } from "@/context/LanguageContext";
import { useWeaponOrNull } from "@/lib/client-data";
import type { WeaponType } from "@/lib/constants";
import type { SaveEquipmentSet } from "@/lib/save-store";
import type { EquipmentIds } from "@/lib/schema";
import type { CodecTables } from "@/lib/set-codec";
import { buildFromSaveSet, resolveSaveSet } from "@/lib/save-sets";
import { evaluateBuild, type BuildSet } from "@/lib/set-build";
import type { SearchData } from "@/lib/set-search";
import { weaponTypesFor } from "@/lib/weapon-suggest";
import * as ui from "@/styles/settings";
import ArmorSetView, { SetStatus } from "./ArmorSetView";

interface SaveSetProps {
  set: SaveEquipmentSet;
  data: SearchData | null;
  ids: EquipmentIds | null;
  tables: CodecTables | null;
  sex: BuildSet["sex"];
}

/** A save set's resolved equipment, its weapon's slots and its calculated stats. */
function useSaveSetView({ set, data, ids, tables, sex }: SaveSetProps) {
  const resolved = useMemo(
    () => (ids && tables ? resolveSaveSet(set, ids, tables) : null),
    [set, ids, tables],
  );
  const { item: weapon, loading: weaponLoading } = useWeaponOrNull(
    resolved?.weapon?.ref.category ?? null,
    resolved?.weapon?.slug ?? null,
  );
  const hunterType: BuildSet["hunterType"] =
    resolved?.weapon &&
    weaponTypesFor("Gunner").includes(resolved.weapon.ref.category as WeaponType)
      ? "Gunner"
      : "Blademaster";
  const build = resolved ? buildFromSaveSet(resolved, weapon?.slots ?? 0, hunterType, sex) : null;
  const waitingForWeapon = !!resolved?.weapon && weaponLoading;
  const evaluated = data && build && !waitingForWeapon ? evaluateBuild(data, build) : null;
  return { resolved, weapon, hunterType, evaluated };
}

/** A save set's row summary: weapon and armor icons, its weapon, defence and good skills. */
export function SaveSetSummary({ set, data, ids, tables, sex }: SaveSetProps) {
  const t = useT();
  const game = useGameText();
  const { formatNumber } = useLocale();
  const { resolved, hunterType, evaluated } = useSaveSetView({ set, data, ids, tables, sex });
  if (!resolved) return null;
  const good =
    evaluated?.skills.filter((s) => s.threshold > 0).map((s) => game.name("skill", s.name)) ?? [];
  return (
    <span className="flex flex-col gap-[0.2rem] text-fine text-white/60">
      <span className="flex flex-wrap items-center gap-x-[0.4rem]">
        {resolved.weapon && (
          <Icon
            type={resolved.weapon.ref.category}
            size="mini"
            rarity={resolved.weapon.ref.rarity}
            alt={game.name("weapon", resolved.weapon.ref.name)}
          />
        )}
        {resolved.armor.map((p, i) =>
          p ? (
            <Icon
              key={i}
              type={p.slot}
              size="mini"
              rarity={p.rarity}
              alt={game.name("armor", p.name)}
            />
          ) : null,
        )}
        <span className="ml-[0.4rem]">
          {/* `weapon` is the resolved set's, not the bundle's (it may still load). */}
          {resolved.weapon && `${game.name("weapon", resolved.weapon.ref.name)} · `}
          {t.setBuilder.mySets.summary(
            t.setBuilder.hunterTypes[hunterType],
            evaluated ? formatNumber(evaluated.defence) : "-",
          )}
        </span>
      </span>
      {good.length > 0 && (
        <span className="whitespace-normal text-white/80">{good.join(", ")}</span>
      )}
    </span>
  );
}

/** A save set's full equipment, read-only (opened from My sets). */
export function SaveSetDetail({ set, data, ids, tables, sex }: SaveSetProps) {
  const t = useT();
  const text = t.setBuilder.saveSets;
  const { resolved, weapon, hunterType, evaluated } = useSaveSetView({
    set,
    data,
    ids,
    tables,
    sex,
  });
  if (!resolved) {
    return <Loading className={ui.note}>{t.setBuilder.results.loading}</Loading>;
  }
  const unknown = resolved.unknown.map((u) => {
    if (u.kind === "weapon") return text.unknownWeapon(u.gameId);
    if (u.kind === "armor") return text.unknownPiece(t.common.armorSlots[u.slot], u.gameId);
    return text.unknownDecoration(u.itemId);
  });
  return (
    <div className="flex flex-col gap-[1.2rem]">
      {unknown.length > 0 && (
        <p role="alert" className="m-0 text-fine whitespace-normal text-negative">
          {text.unknown(unknown.join(", "))}
        </p>
      )}
      {evaluated ? (
        <ArmorSetView
          set={evaluated}
          weaponSlots={weapon?.slots ?? 0}
          weaponIcon={
            resolved.weapon?.ref.category ??
            (hunterType === "Gunner" ? "heavy-bowgun" : "great-sword")
          }
          weapon={
            resolved.weapon
              ? {
                  name: resolved.weapon.ref.name,
                  icon: resolved.weapon.ref.category,
                  href: resolved.weapon.ref.href,
                  rarity: weapon?.rarity ?? resolved.weapon.ref.rarity,
                }
              : null
          }
          status={<SetStatus set={evaluated} />}
        />
      ) : (
        <Loading className={ui.note}>{text.loadingWeapon}</Loading>
      )}
    </div>
  );
}
