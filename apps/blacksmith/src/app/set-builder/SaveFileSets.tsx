"use client";

/**
 * The Save file tab: the equipment sets the loaded hunter registered at the
 * smithy, shown read-only in the game's set screen. Each set keeps its
 * in-game number (deleted registrations leave gaps) and shows its actual
 * weapon, armor, decorations and calculated skills and stats.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import Loading from "@/components/Loading";
import { useSave } from "@/context/SaveContext";
import { useT } from "@/context/LanguageContext";
import { hunterPageHref } from "@/lib/hunter-pages";
import { useWeaponOrNull } from "@/lib/client-data";
import { buildFromSaveSet, resolveSaveSet } from "@/lib/save-sets";
import type { CodecTables } from "@/lib/set-codec";
import { evaluateBuild, type BuildSet } from "@/lib/set-build";
import type { EquipmentIds } from "@/lib/schema";
import type { SearchData } from "@/lib/set-search";
import { weaponTypesFor } from "@/lib/weapon-suggest";
import type { WeaponType } from "@/lib/constants";
import * as ui from "@/styles/settings";
import ArmorSetView, { SetHeader, SetStatus } from "./ArmorSetView";

export default function SaveFileSets({
  data,
  ids,
  tables,
  loadError,
  idsError,
}: {
  data: SearchData | null;
  ids: EquipmentIds | null;
  /** The set builder's codec lookups; built from `data` and `ids`. */
  tables: CodecTables | null;
  loadError: string | null;
  idsError: boolean;
}) {
  const t = useT();
  const text = t.setBuilder.saveSets;
  const { save } = useSave();
  const [index, setIndex] = useState(0);

  const sets = save?.equipmentSets ?? [];
  const selected = sets.length > 0 ? Math.min(index, sets.length - 1) : 0;
  const current = sets[selected] ?? null;
  const resolved = useMemo(
    () => (current && ids && tables ? resolveSaveSet(current, ids, tables) : null),
    [current, ids, tables],
  );
  const { item: weapon, loading: weaponLoading } = useWeaponOrNull(
    resolved?.weapon?.ref.category ?? null,
    resolved?.weapon?.slug ?? null,
  );

  if (!save) {
    return (
      <div className="flex flex-col gap-[1.2rem]">
        <p className={ui.note}>{text.noSave}</p>
        <div className={ui.actions}>
          <Link href={hunterPageHref("save")} className={ui.button}>
            {text.loadSave}
          </Link>
        </div>
      </div>
    );
  }
  // A save stored before the site read equipment sets: it has to be loaded again.
  if (save.equipmentSets === undefined) {
    return (
      <div className="flex flex-col gap-[1.2rem]">
        <p className={ui.note}>{text.stale}</p>
        <div className={ui.actions}>
          <Link href={hunterPageHref("save")} className={ui.button}>
            {text.reload}
          </Link>
        </div>
      </div>
    );
  }
  if (sets.length === 0) return <p className={ui.note}>{text.empty}</p>;
  if (loadError) return <p className={ui.error}>{t.setBuilder.results.loadError}</p>;
  if (idsError) return <p className={ui.error}>{t.setBuilder.open.idsUnavailable}</p>;
  if (!data || !ids || !tables || !resolved) {
    return <Loading className={ui.note}>{t.setBuilder.results.loading}</Loading>;
  }

  const step = (by: 1 | -1) => setIndex((selected + by + sets.length) % sets.length);
  const hunterType: BuildSet["hunterType"] =
    resolved.weapon && weaponTypesFor("Gunner").includes(resolved.weapon.ref.category as WeaponType)
      ? "Gunner"
      : "Blademaster";
  const sex: BuildSet["sex"] = save.sex === "Female" ? "Female" : "Male";
  const build = buildFromSaveSet(resolved, weapon?.slots ?? 0, hunterType, sex);
  // The weapon's bundle says how many slots it has: wait for it, or its jewels
  // would be left out of the skills.
  const waitingForWeapon = !!resolved.weapon && weaponLoading;
  const evaluated = waitingForWeapon ? null : evaluateBuild(data, build);
  const unknown = resolved.unknown.map((u) => {
    if (u.kind === "weapon") return text.unknownWeapon(u.gameId);
    if (u.kind === "armor") return text.unknownPiece(t.common.armorSlots[u.slot], u.gameId);
    return text.unknownDecoration(u.itemId);
  });

  return (
    <div className="flex flex-col gap-[1.2rem]">
      <SetHeader index={selected} count={sets.length} number={resolved.number} onStep={step} />
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
