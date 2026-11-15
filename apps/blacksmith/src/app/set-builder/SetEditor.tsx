"use client";

/**
 * The set editor: the equipment set screen (ArmorSetView) with every piece
 * and decoration editable, and the stats worked out live as the set changes.
 * Tapping a row opens the piece picker; "+ Jewel" opens the decoration
 * picker for that bin's free slots.
 */
import { useMemo, useState } from "react";
import { useT } from "@/context/LanguageContext";
import type { ArmorRank, ArmorSlot } from "@/lib/constants";
import type { Tier } from "@/lib/min-rank";
import {
  evaluateBuild,
  freeSlotsIn,
  pieceIn,
  validateBuild,
  withDecoration,
  withoutDecoration,
  withPiece,
  withWeaponSlots,
  type BuildSet,
} from "@/lib/set-build";
import type { DecoBin, Piece, SearchData } from "@/lib/set-search";
import ArmorSetView, { PanelTitle, SetStatus } from "./ArmorSetView";
import { DecorationPicker, PiecePicker } from "./Pickers";

type Picking = { kind: "piece"; slot: ArmorSlot } | { kind: "decoration"; bin: DecoBin } | null;

export default function SetEditor({
  data,
  set,
  onChange,
  wanted,
  rank,
  questLimit,
  ownedOnly,
  isOwned,
  weaponIcon,
  title,
  extraWarnings,
}: {
  data: SearchData;
  set: BuildSet;
  onChange: (set: BuildSet) => void;
  /** Wanted skill trees (the form's skills). */
  wanted: string[];
  rank: ArmorRank;
  questLimit: Tier | null;
  ownedOnly: boolean;
  isOwned?: (p: Piece) => boolean;
  weaponIcon: string;
  /** Above the set: its name and actions. */
  title: React.ReactNode;
  /** Problems found opening the set (e.g. a shared link's unknown IDs). */
  extraWarnings?: string[];
}) {
  const t = useT();
  const [picking, setPicking] = useState<Picking>(null);
  const evaluated = useMemo(() => evaluateBuild(data, set, wanted), [data, set, wanted]);
  const warnings = useMemo(() => validateBuild(set), [set]);

  if (picking?.kind === "piece") {
    return (
      <PiecePicker
        slot={picking.slot}
        pieces={data.pieces}
        current={pieceIn(set, picking.slot)}
        hunter={set}
        rank={rank}
        wanted={wanted}
        questLimit={questLimit}
        ownedOnly={ownedOnly}
        isOwned={isOwned}
        onPick={(p) => {
          onChange(withPiece(set, picking.slot, p));
          setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
    );
  }
  if (picking?.kind === "decoration") {
    const free = freeSlotsIn(set, picking.bin);
    return (
      <DecorationPicker
        bin={picking.bin}
        free={free}
        decorations={data.decorations}
        wanted={wanted}
        questLimit={questLimit}
        onPick={(d) => {
          const next = withDecoration(set, picking.bin, d);
          onChange(next);
          // Stay open while slots are left, to fill a piece in one go.
          if (freeSlotsIn(next, picking.bin) === 0) setPicking(null);
        }}
        onClose={() => setPicking(null)}
      />
    );
  }

  return (
    <div className="flex flex-col gap-[1.3rem]">
      {title}
      {extraWarnings?.map((w, i) => (
        <p key={i} role="alert" className="m-0 text-fine whitespace-normal text-negative">
          {w}
        </p>
      ))}
      <ArmorSetView
        set={{ ...evaluated, decorations: set.decorations }}
        weaponSlots={set.weaponSlots}
        weaponIcon={weaponIcon}
        status={
          <>
            <PanelTitle>{t.setBuilder.results.status}</PanelTitle>
            <SetStatus set={evaluated} />
          </>
        }
        edit={{
          onPickPiece: (slot) => setPicking({ kind: "piece", slot }),
          onAddDecoration: (bin) => setPicking({ kind: "decoration", bin }),
          onRemoveDecoration: (i) => onChange(withoutDecoration(set, i)),
          onWeaponSlots: (n) => onChange(withWeaponSlots(set, n)),
          freeSlots: (bin) => freeSlotsIn(set, bin),
          warnings,
          isOwned,
        }}
      />
    </div>
  );
}
