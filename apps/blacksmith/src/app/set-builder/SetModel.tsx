"use client";

/**
 * The 3D model button of a custom set, with its sheet: the set's pieces on a
 * hunter of its sex. The set builder drops one beside a result, as one of the
 * result's buttons, or in the editor's title bar as the bare cube.
 */
import { useState } from "react";
import ArmorSetModelViewer, { type ArmorSetPiece } from "@/components/ArmorSetModelViewer";
import { ModelButton, ModelCube } from "@/components/ModelPopover";
import { useT } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";
import { secondaryButton } from "@/styles/set-builder";
import Sheet from "./Sheet";

interface Props {
  pieces: readonly (ArmorSetPiece | null)[];
  sex: "male" | "female";
  label: string;
  /** A button like the result's others (the cube and its label), or the bare cube. */
  variant?: "button" | "icon";
}

export default function SetModel({ pieces, sex, label, variant = "icon" }: Props) {
  const [open, setOpen] = useState(false);
  const text = useT().equipment.model;
  if (!pieces.some((piece) => piece !== null)) return null;
  const action = open ? text.hide : text.view;
  return (
    <>
      {variant === "button" ? (
        <button
          type="button"
          className={cn(secondaryButton, "grow gap-[0.8rem]")}
          aria-label={action}
          title={action}
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <ModelCube className="h-[3.2rem] w-[3rem]" />
          {/* Just the icon on phones, beside the wishlist button. */}
          <span className="mobile:sr-only">{action}</span>
        </button>
      ) : (
        <ModelButton open={open} onClick={() => setOpen(true)} />
      )}
      <Sheet open={open} onClose={() => setOpen(false)} title={label}>
        <div className="h-[min(60dvh,44rem)] min-h-[24rem] w-full flex-none">
          <ArmorSetModelViewer pieces={pieces} sex={sex} label={label} />
        </div>
      </Sheet>
    </>
  );
}
