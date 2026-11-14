"use client";

import { useT } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";
import { modelPanel, modelPanelButton } from "@/styles/model";

export interface HitzonePart {
  /** The data's part id ("front-legs"). */
  name: string;
  /** The part's name in the site's language. */
  label: string;
  /** `var(--color-hitbox-N)`. */
  color: string;
}

/** A break reward in the legend: its highlight key and name (in the site's language). */
export interface HitzoneBreak {
  key: string;
  name: string;
}

interface Props {
  parts: HitzonePart[];
  /** Breakable parts, listed under the hitzone parts. */
  breaks?: HitzoneBreak[];
  show: boolean;
  onShowChange: (show: boolean) => void;
  /** The part picked in the legend (a tap on phones), highlighted until picked again. */
  pinned: string | null;
  onPin: (part: string | null) => void;
  /** A part hovered or focused in the legend; null when it leaves. */
  onHover: (part: string | null) => void;
}

/**
 * Over a monster's 3D model: a switch for its hitboxes and, while they show,
 * a legend of the hitzone parts in their colours, then its breakable parts.
 * Hovering or focusing an entry highlights its hitboxes; clicking pins it.
 */
export default function HitzoneControls({
  parts,
  breaks = [],
  show,
  onShowChange,
  pinned,
  onPin,
  onHover,
}: Props) {
  const { hitzones: t, breaks: breakText } = useT().monsters;
  return (
    <>
      <button
        type="button"
        onClick={() => onShowChange(!show)}
        aria-pressed={show}
        className={cn(
          modelPanel,
          modelPanelButton,
          "absolute bottom-2 left-2 z-10",
          show ? "text-stat" : "text-parchment",
        )}
      >
        {t.show}
      </button>
      {show && (
        <ul
          aria-label={t.legend}
          className={cn(modelPanel, "absolute top-2 left-2 z-10 flex flex-col")}
          onPointerLeave={() => onHover(null)}
        >
          {parts.map((part) => (
            <LegendEntry
              key={part.name}
              id={part.name}
              pinned={pinned}
              onPin={onPin}
              onHover={onHover}
            >
              <span
                aria-hidden
                className="size-[1rem] shrink-0"
                style={{ backgroundColor: part.color }}
              />
              {part.label}
            </LegendEntry>
          ))}
          {breaks.length > 0 && (
            <li aria-hidden className="mt-[0.4rem] text-gold">
              {breakText.legend}
            </li>
          )}
          {breaks.map((b) => (
            <LegendEntry key={b.key} id={b.key} pinned={pinned} onPin={onPin} onHover={onHover}>
              <span aria-hidden className="w-[1rem] shrink-0 text-center text-gold">
                ◆
              </span>
              <span className="sr-only">{breakText.legendPrefix}</span>
              {b.name}
            </LegendEntry>
          ))}
        </ul>
      )}
    </>
  );
}

interface LegendEntryProps {
  /** The part name or break key it highlights. */
  id: string;
  pinned: string | null;
  onPin: (id: string | null) => void;
  onHover: (id: string | null) => void;
  children: React.ReactNode;
}

function LegendEntry({ id, pinned, onPin, onHover, children }: LegendEntryProps) {
  return (
    <li>
      <button
        type="button"
        aria-pressed={pinned === id}
        onClick={() => onPin(pinned === id ? null : id)}
        onPointerEnter={(e) => e.pointerType === "mouse" && onHover(id)}
        onFocus={() => onHover(id)}
        onBlur={() => onHover(null)}
        className={cn(
          "flex cursor-pointer items-center gap-[0.6rem] text-left hover:text-white focus-visible:text-white",
          pinned === id ? "text-white underline" : "text-parchment",
        )}
      >
        {children}
      </button>
    </li>
  );
}
