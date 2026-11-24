"use client";

/**
 * The 3D model button of a custom set, with its sheet: the set's pieces on a
 * hunter of its sex. The set builder drops one beside a result or in the
 * editor's title bar.
 */
import { useState } from "react";
import ArmorSetModelViewer, { type ArmorSetPiece } from "@/components/ArmorSetModelViewer";
import { ModelButton } from "@/components/ModelPopover";
import Sheet from "./Sheet";

interface Props {
  pieces: readonly (ArmorSetPiece | null)[];
  sex: "male" | "female";
  label: string;
}

export default function SetModel({ pieces, sex, label }: Props) {
  const [open, setOpen] = useState(false);
  if (!pieces.some((piece) => piece !== null)) return null;
  return (
    <>
      <ModelButton open={open} onClick={() => setOpen(true)} />
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <div className="h-[min(60dvh,44rem)] min-h-[24rem] w-full flex-none">
          <ArmorSetModelViewer pieces={pieces} sex={sex} label={label} />
        </div>
      </Sheet>
    </>
  );
}
