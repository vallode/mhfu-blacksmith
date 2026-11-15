"use client";

/**
 * "My sets": the armor sets the player saved (saved-sets-store.ts), each
 * with Open, Rename, Duplicate and Delete. A set's summary comes from
 * decoding its code, so a set saved with a piece the data no longer has
 * still lists (and opens with a warning).
 */
import { useState } from "react";
import Icon from "@/components/Icon";
import { useGameText, useLocale, useT } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";
import type { SavedSet } from "@/lib/saved-sets-store";
import { evaluateBuild } from "@/lib/set-build";
import { decodeSet, type CodecTables } from "@/lib/set-codec";
import type { SearchData } from "@/lib/set-search";
import * as ui from "@/styles/settings";
import { PanelTitle } from "./ArmorSetView";

function Summary({ set, data, tables }: { set: SavedSet; data: SearchData; tables: CodecTables }) {
  const t = useT();
  const game = useGameText();
  const { formatNumber } = useLocale();
  const r = decodeSet(set.code, tables);
  if (!r.ok) return <span className={ui.error}>{t.setBuilder.mySets.cantOpen}</span>;
  const stats = evaluateBuild(data, r.set);
  const good = stats.skills.filter((s) => s.threshold > 0).map((s) => game.name("skill", s.name));
  return (
    <span className="flex flex-col gap-[0.2rem] text-fine text-white/60">
      <span className="flex flex-wrap items-center gap-x-[0.4rem]">
        {r.set.pieces.map((p, i) =>
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
          {t.setBuilder.mySets.summary(
            t.setBuilder.hunterTypes[r.set.hunterType],
            formatNumber(stats.defence),
          )}
        </span>
      </span>
      {good.length > 0 && (
        <span className="whitespace-normal text-white/80">{good.join(", ")}</span>
      )}
    </span>
  );
}

export default function MySets({
  sets,
  data,
  tables,
  openId,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
}: {
  sets: SavedSet[];
  data: SearchData | null;
  tables: CodecTables | null;
  /** The saved set in the editor. */
  openId: string | null;
  onOpen: (set: SavedSet) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const t = useT();
  const text = t.setBuilder.mySets;
  const [renaming, setRenaming] = useState<string | null>(null);
  const [name, setName] = useState("");

  return (
    <div className="flex flex-col gap-[1.3rem]">
      <PanelTitle>{t.setBuilder.tabs.sets}</PanelTitle>
      {sets.length === 0 && <p className={ui.note}>{text.empty}</p>}
      <ul className="m-0 flex list-none flex-col p-0">
        {sets.map((s) => (
          <li
            key={s.id}
            className={cn(
              "flex flex-col gap-[0.6rem] border-b border-white/15 px-[0.4rem] py-[0.8rem]",
              s.id === openId && "bg-white/5",
            )}
          >
            {renaming === s.id ? (
              <form
                className="flex gap-[0.8rem]"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (name.trim()) onRename(s.id, name.trim());
                  setRenaming(null);
                }}
              >
                <input
                  className={ui.searchInput}
                  aria-label={text.nameLabel}
                  value={name}
                  maxLength={40}
                  autoFocus
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && setRenaming(null)}
                />
                <button type="submit" className={ui.button}>
                  {text.ok}
                </button>
              </form>
            ) : (
              <span className="flex items-baseline gap-[0.8rem]">
                <span className="min-w-0 flex-1 truncate text-sub text-white">{s.name}</span>
                {s.id === openId && <span className="text-fine text-stat">{text.inEditor}</span>}
              </span>
            )}
            {data && tables && <Summary set={s} data={data} tables={tables} />}
            <div className={ui.actions}>
              <button
                type="button"
                className={ui.button}
                disabled={!tables}
                onClick={() => onOpen(s)}
              >
                {text.open}
              </button>
              <button
                type="button"
                className={ui.button}
                aria-label={text.renameLabel(s.name)}
                onClick={() => {
                  setName(s.name);
                  setRenaming(s.id);
                }}
              >
                {text.rename}
              </button>
              <button
                type="button"
                className={ui.button}
                aria-label={text.duplicateLabel(s.name)}
                onClick={() => onDuplicate(s.id)}
              >
                {text.duplicate}
              </button>
              <button
                type="button"
                className={ui.buttonSecondary}
                aria-label={text.deleteLabel(s.name)}
                onClick={() => onDelete(s.id)}
              >
                {text.delete}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
