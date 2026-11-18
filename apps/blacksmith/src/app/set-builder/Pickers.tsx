"use client";

/**
 * The set editor's pickers, shown in place of the set (like the game's
 * equipment screens, which open a list for the slot you chose): one for the
 * armor piece of a slot, one for a decoration to put in a bin's free slots.
 */
import { useMemo, useState } from "react";
import Icon from "@/components/Icon";
import { Slots } from "@/components/DetailPanel";
import { SelectorRow, ToggleRow, type Choice } from "@/components/SettingRows";
import { useGameText, useLocale, useT } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";
import { ARMOR_RANKS, type ArmorRank, type ArmorSlot } from "@/lib/constants";
import type { GameText } from "@/lib/i18n/game-text";
import { LOCALE_TAGS } from "@/lib/i18n/locales";
import { isAvailable, type Tier } from "@/lib/min-rank";
import { suitsHunter, type BuildSet } from "@/lib/set-build";
import { TORSO_UP_TREE, type DecoBin, type Deco, type Piece } from "@/lib/set-search";
import * as ui from "@/styles/settings";
import { binLabel } from "./ArmorSetView";

/** Rows shown at once; the search narrows the rest. */
const MAX_ROWS = 150;

const rowButton =
  "grid w-full cursor-pointer grid-cols-[3.8rem_minmax(0,1fr)_auto] items-center gap-x-[0.8rem] border-0 border-b border-white/15 bg-transparent px-[0.4rem] py-[0.6rem] text-left font-[inherit] text-small text-white hover:hover-glow focus-visible:hover-glow focus-visible:outline-none";

function PickerFrame({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const t = useT();
  return (
    <div
      className="flex flex-col gap-[1.3rem]"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="flex items-center gap-[1rem] bg-selector px-[0.8rem] py-[0.4rem]">
        <h3 className="m-0 flex-1 text-main font-normal text-stat text-shadow-[0.15rem_0.15rem_black]">
          {title}
        </h3>
        <button type="button" className={ui.button} onClick={onClose}>
          {t.common.back}
        </button>
      </div>
      {children}
    </div>
  );
}

/** "Attack +3  Expert +2" with the wanted trees first and brighter. */
function PointsList({ points, wanted }: { points: Record<string, number>; wanted: string[] }) {
  const game = useGameText();
  const entries = Object.entries(points)
    .filter(([t, v]) => v !== 0 && t !== TORSO_UP_TREE)
    .sort((a, b) => Number(wanted.includes(b[0])) - Number(wanted.includes(a[0])));
  if (entries.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-x-[1.2rem] text-fine">
      {entries.map(([t, v]) => (
        <span
          key={t}
          className={cn(
            v < 0 ? "text-negative" : wanted.includes(t) ? "text-positive" : "text-white/50",
          )}
        >
          {game.name("skill", t)} {v > 0 ? `+${v}` : v}
        </span>
      ))}
    </span>
  );
}

const wantedScore = (points: Record<string, number>, wanted: string[]) =>
  wanted.reduce((n, t) => n + Math.max(0, points[t] ?? 0), 0);

/**
 * Does a piece or decoration match the search box? Its name and skill trees
 * match in English and in the site's language.
 */
function matches(
  game: GameText,
  kind: "armor" | "decoration",
  item: { name: string; points: Record<string, number> },
  q: string,
): boolean {
  const has = (english: string, translated: string) =>
    english.toLowerCase().includes(q) || translated.toLowerCase().includes(q);
  return (
    has(item.name, game.name(kind, item.name)) ||
    Object.keys(item.points).some((t) => has(t, game.name("skill", t)))
  );
}

type RankFilter = ArmorRank | "all";
type PieceSort = "skills" | "defence" | "name";
const PIECE_SORTS: PieceSort[] = ["skills", "defence", "name"];

export function PiecePicker({
  slot,
  pieces,
  current,
  hunter,
  rank,
  wanted,
  questLimit,
  ownedOnly: ownedOnlyDefault,
  isOwned,
  onPick,
  onClose,
}: {
  slot: ArmorSlot;
  /** Every piece (all slots). */
  pieces: Piece[];
  current: Piece | null;
  hunter: Pick<BuildSet, "hunterType" | "sex">;
  /** The form's rank: the picker starts on it. */
  rank: ArmorRank;
  /** Wanted skill trees, for the skill sort and highlighting. */
  wanted: string[];
  questLimit: Tier | null;
  ownedOnly: boolean;
  /** Only with a save loaded. */
  isOwned?: (p: Piece) => boolean;
  onPick: (p: Piece | null) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [rankFilter, setRankFilter] = useState<RankFilter>(rank);
  const [sort, setSort] = useState<PieceSort>(wanted.length > 0 ? "skills" : "defence");
  const [ownedOnly, setOwnedOnly] = useState(ownedOnlyDefault && !!isOwned);
  const t = useT();
  const text = t.setBuilder.pickers;
  const game = useGameText();
  const { locale } = useLocale();
  const rankChoices: Choice<RankFilter>[] = [
    ...ARMOR_RANKS.map((r) => ({ value: r, label: t.common.ranks[r] })),
    { value: "all", label: text.allRanks },
  ];
  const sortChoices: Choice<PieceSort>[] = PIECE_SORTS.map((s) => ({
    value: s,
    label: text.sorts[s],
  }));

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const collator = new Intl.Collator(LOCALE_TAGS[locale]);
    const shown = pieces.filter(
      (p) =>
        p.slot === slot &&
        (rankFilter === "all" || p.rank === rankFilter) &&
        suitsHunter(p, hunter.hunterType, hunter.sex) &&
        isAvailable(p.minRank, questLimit) &&
        (!ownedOnly || isOwned?.(p)) &&
        (!q || matches(game, "armor", p, q)),
    );
    const by: Record<PieceSort, (a: Piece, b: Piece) => number> = {
      skills: (a, b) =>
        wantedScore(b.points, wanted) - wantedScore(a.points, wanted) ||
        b.slots - a.slots ||
        b.defence - a.defence,
      defence: (a, b) => b.defence - a.defence,
      name: (a, b) => collator.compare(game.name("armor", a.name), game.name("armor", b.name)),
    };
    return shown.sort(
      (a, b) =>
        by[sort](a, b) || ARMOR_RANKS.indexOf(a.rank) - ARMOR_RANKS.indexOf(b.rank) || a.id - b.id,
    );
  }, [
    pieces,
    slot,
    rankFilter,
    hunter,
    questLimit,
    ownedOnly,
    isOwned,
    query,
    sort,
    wanted,
    game,
    locale,
  ]);

  return (
    <PickerFrame title={text.pieceTitle(binLabel(t, slot))} onClose={onClose}>
      <input
        className={ui.searchInput}
        type="search"
        aria-label={text.searchArmor}
        placeholder={text.searchPlaceholder}
        value={query}
        autoComplete="off"
        spellCheck={false}
        autoFocus
        onChange={(e) => setQuery(e.target.value)}
      />
      <SelectorRow
        label={text.rank}
        choices={rankChoices}
        value={rankFilter}
        onChange={setRankFilter}
      />
      <SelectorRow label={text.sortBy} choices={sortChoices} value={sort} onChange={setSort} />
      {isOwned && (
        <ToggleRow label={t.setBuilder.form.ownedOnly} value={ownedOnly} onChange={setOwnedOnly} />
      )}
      <p className={ui.note}>
        {text.pieceCount(
          t.setBuilder.hunterTypes[hunter.hunterType],
          t.setBuilder.sexes[hunter.sex],
          !!questLimit,
          list.length,
          list.length > MAX_ROWS ? MAX_ROWS : null,
        )}
      </p>
      <ul className="m-0 list-none p-0">
        {current && (
          <li>
            <button type="button" className={rowButton} onClick={() => onPick(null)}>
              <span />
              <span className="text-white/60">
                {t.setBuilder.setView.remove(game.name("armor", current.name))}
              </span>
              <span />
            </button>
          </li>
        )}
        {list.slice(0, MAX_ROWS).map((p) => (
          <li key={p.id}>
            <button
              type="button"
              className={cn(rowButton, p === current && "bg-white/10")}
              aria-current={p === current || undefined}
              onClick={() => onPick(p)}
            >
              <Icon type={p.slot} size="mini" rarity={p.rarity} alt="" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate mobile:whitespace-normal">
                  {game.name("armor", p.name)}
                  {isOwned?.(p) && (
                    <span className="ml-[0.8rem] text-fine text-positive">
                      {t.setBuilder.setView.owned}
                    </span>
                  )}
                  {p.torsoUp && (
                    <span className="ml-[0.8rem] text-fine text-white/50">
                      {t.setBuilder.setView.torsoUp}
                    </span>
                  )}
                </span>
                <PointsList points={p.points} wanted={wanted} />
              </span>
              <span className="flex flex-col items-end text-fine">
                <Slots count={p.slots} />
                <span className="text-white/60">{p.defence}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </PickerFrame>
  );
}

export function DecorationPicker({
  bin,
  free,
  decorations,
  wanted,
  questLimit,
  onPick,
  onClose,
}: {
  bin: DecoBin;
  /** Free slots in the bin: larger decorations aren't offered. */
  free: number;
  decorations: Deco[];
  wanted: string[];
  questLimit: Tier | null;
  onPick: (d: Deco) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const t = useT();
  const text = t.setBuilder.pickers;
  const game = useGameText();
  const { locale } = useLocale();
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const collator = new Intl.Collator(LOCALE_TAGS[locale]);
    return decorations
      .filter(
        (d) =>
          d.slots <= free &&
          isAvailable(d.minRank, questLimit) &&
          (!q || matches(game, "decoration", d, q)),
      )
      .sort(
        (a, b) =>
          wantedScore(b.points, wanted) / b.slots - wantedScore(a.points, wanted) / a.slots ||
          collator.compare(game.name("decoration", a.name), game.name("decoration", b.name)),
      );
  }, [decorations, free, questLimit, query, wanted, game, locale]);

  return (
    <PickerFrame title={text.decorationTitle(binLabel(t, bin), free)} onClose={onClose}>
      <input
        className={ui.searchInput}
        type="search"
        aria-label={text.searchDecorations}
        placeholder={text.searchPlaceholder}
        value={query}
        autoComplete="off"
        spellCheck={false}
        autoFocus
        onChange={(e) => setQuery(e.target.value)}
      />
      <p className={ui.note}>{text.decorationCount(list.length, !!questLimit)}</p>
      <ul className="m-0 list-none p-0">
        {list.map((d) => (
          <li key={d.id}>
            <button type="button" className={rowButton} onClick={() => onPick(d)}>
              <Icon type="decoration" size="mini" color={d.color} alt="" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate mobile:whitespace-normal">
                  {game.name("decoration", d.name)}
                </span>
                <PointsList points={d.points} wanted={wanted} />
              </span>
              <span className="text-fine">
                <Slots count={d.slots} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </PickerFrame>
  );
}
