"use client";

/**
 * The always used or never used pieces, under the skills: one row each, with
 * a × that takes it off the list, and a Clear for the lot.
 */
import Icon from "@/components/Icon";
import { useGameText } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";
import type { Messages } from "@/lib/i18n/messages";
import type { Piece } from "@/lib/set-search";
import { chip, chipOff, chipOn, textButton } from "@/styles/set-builder";
import * as ui from "@/styles/settings";

export default function PieceChips({
  text,
  on,
  hrefs,
  piecesOf,
  isOff,
  offNote,
  onRemove,
  onClear,
}: {
  text: Messages["setBuilder"]["form"]["excluded"];
  on?: boolean;
  /** The pieces' links, from the form: the heading shows before the data loads. */
  hrefs: string[];
  /** The pieces the data has; empty until it loads. */
  piecesOf: (hrefs: string[]) => Piece[];
  /** Pieces the search leaves out anyway (greyed out), explained by `offNote`. */
  isOff?: (p: Piece) => boolean;
  offNote?: string;
  onRemove: (href: string) => void;
  onClear: () => void;
}) {
  const game = useGameText();
  if (hrefs.length === 0) return null;
  const pieces = piecesOf(hrefs);
  const anyOff = !!isOff && pieces.some(isOff);
  return (
    <div className="flex flex-col gap-[0.8rem] border-t border-white/15 pt-[0.8rem]">
      <div className="flex items-baseline justify-between gap-[1rem]">
        <span className={ui.statusLabel}>{text.title}</span>
        <button type="button" className={textButton} aria-label={text.clearLabel} onClick={onClear}>
          {text.clear}
        </button>
      </div>
      <p className={ui.note}>{text.note}</p>
      <ul className="m-0 flex list-none flex-col gap-[0.8rem] p-0">
        {pieces.map((p) => {
          const off = !!isOff?.(p);
          return (
            <li
              key={p.href}
              className={cn(chip, on && !off ? chipOn : chipOff, "w-full cursor-default pr-0")}
            >
              <Icon type={p.slot} size="mini" rarity={p.rarity} className="mr-0 scale-75" />
              <span className={cn("min-w-0 flex-1", off && "text-white/40 line-through")}>
                {game.name("armor", p.name)}
              </span>
              <button
                type="button"
                aria-label={text.remove(game.name("armor", p.name))}
                className="flex size-[3.2rem] flex-none cursor-pointer items-center justify-center border-none bg-transparent p-0 text-sub leading-none text-white/50 hover:text-negative focus-visible:text-negative"
                onClick={() => onRemove(p.href)}
              >
                ×
              </button>
            </li>
          );
        })}
      </ul>
      {anyOff && offNote && <p className={ui.note}>{offNote}</p>}
    </div>
  );
}
