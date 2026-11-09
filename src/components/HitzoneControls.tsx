"use client";

import { useT } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";

export interface HitzonePart {
  /** The data's part id ("front-legs"). */
  name: string;
  /** The part's name in the site's language. */
  label: string;
  /** `var(--color-hitbox-N)`. */
  color: string;
}

interface Props {
  parts: HitzonePart[];
  show: boolean;
  onShowChange: (show: boolean) => void;
  /** The part picked in the legend (a tap on phones), highlighted until picked again. */
  pinned: string | null;
  onPin: (part: string | null) => void;
  /** A part hovered or focused in the legend; null when it leaves. */
  onHover: (part: string | null) => void;
}

const panel = "bg-black/50 px-[0.8rem] py-[0.4rem] text-[1.6rem] mobile:text-[1.4rem]";

/**
 * Over a monster's 3D model: a switch for its hitboxes and, while they show,
 * a legend of the hitzone parts in their colours. Hovering or focusing a
 * part highlights its hitboxes; clicking pins it.
 */
export default function HitzoneControls({
  parts,
  show,
  onShowChange,
  pinned,
  onPin,
  onHover,
}: Props) {
  const t = useT().monsters.hitzones;
  return (
    <>
      <button
        type="button"
        onClick={() => onShowChange(!show)}
        aria-pressed={show}
        className={cn(
          panel,
          "absolute bottom-2 left-2 z-10 cursor-pointer tracking-game hover:text-white focus-visible:text-white",
          show ? "text-stat" : "text-parchment",
        )}
      >
        {t.show}
      </button>
      {show && (
        <ul
          aria-label={t.legend}
          className={cn(panel, "absolute top-2 left-2 z-10 flex flex-col")}
          onPointerLeave={() => onHover(null)}
        >
          {parts.map((part) => (
            <li key={part.name}>
              <button
                type="button"
                aria-pressed={pinned === part.name}
                onClick={() => onPin(pinned === part.name ? null : part.name)}
                onPointerEnter={(e) => e.pointerType === "mouse" && onHover(part.name)}
                onFocus={() => onHover(part.name)}
                onBlur={() => onHover(null)}
                className={cn(
                  "flex cursor-pointer items-center gap-[0.6rem] hover:text-white focus-visible:text-white",
                  pinned === part.name ? "text-white underline" : "text-parchment",
                )}
              >
                <span
                  aria-hidden
                  className="size-[1rem] shrink-0"
                  style={{ backgroundColor: part.color }}
                />
                {part.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
