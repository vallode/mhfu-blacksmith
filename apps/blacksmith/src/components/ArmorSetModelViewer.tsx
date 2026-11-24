"use client";

/**
 * The 3D model of an armor set built on the site (the set builder's editor or
 * a search result), not one the game sells as a set. Its pieces are looked up
 * in each slot's armor manifest, then shown together by ArmorModelViewer as
 * parts, just as an armor page shows a piece's full set.
 */
import Loading from "@/components/Loading";
import ArmorModelViewer from "@/components/ArmorModelViewer";
import { useT } from "@/context/LanguageContext";
import { ARMOR_SLOTS, type ArmorSlot } from "@/lib/constants";
import { useArmorSetModels } from "@/lib/models";

export interface ArmorSetPiece {
  slot: ArmorSlot;
  name: string;
}

interface Props {
  /** The set's pieces, one per slot at most (the editor has gaps). */
  pieces: readonly (ArmorSetPiece | null)[];
  /** The hunter's sex, which the set was built for. */
  sex: "male" | "female";
  label: string;
}

export default function ArmorSetModelViewer({ pieces, sex, label }: Props) {
  const tm = useT().equipment.model;
  const hasPieces = pieces.some((piece) => piece !== null);
  // The models' names in slot order, so the manifest lookup doesn't restart
  // when the caller lists the same pieces in another order.
  const bySlot: Partial<Record<ArmorSlot, string | null>> = {};
  for (const slot of ARMOR_SLOTS)
    bySlot[slot] = pieces.find((piece) => piece?.slot === slot)?.name ?? null;
  const models = useArmorSetModels(bySlot);

  if (!hasPieces)
    return (
      <p className="flex h-full items-center justify-center text-center opacity-70">
        {tm.unavailable}
      </p>
    );
  if (!models) return <Loading className="h-full justify-center">{tm.loading}</Loading>;
  if (models.male.length === 0 && models.female.length === 0)
    return (
      <p className="flex h-full items-center justify-center text-center opacity-70">
        {tm.unavailable}
      </p>
    );

  return <ArmorModelViewer setModels={models} label={label} sex={sex} />;
}
