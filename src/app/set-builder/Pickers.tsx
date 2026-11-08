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
import { cn } from "@/lib/cn";
import { ARMOR_RANKS, type ArmorRank, type ArmorSlot } from "@/lib/constants";
import { isAvailable, type Tier } from "@/lib/min-rank";
import { BIN_LABELS, suitsHunter, type BuildSet } from "@/lib/set-build";
import { TORSO_UP_TREE, type DecoBin, type Deco, type Piece } from "@/lib/set-search";
import * as ui from "@/styles/settings";

/** Rows shown at once; the search narrows the rest. */
const MAX_ROWS = 150;

const rowButton =
  "grid w-full cursor-pointer grid-cols-[3.8rem_minmax(0,1fr)_auto] items-center gap-x-[0.8rem] border-0 border-b border-white/15 bg-transparent px-[0.4rem] py-[0.6rem] text-left font-[inherit] text-[1.6rem] text-white hover:hover-glow focus-visible:hover-glow focus-visible:outline-none";

function PickerFrame({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="flex flex-col gap-[1.3rem]"
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div className="flex items-center gap-[1rem] bg-selector px-[0.8rem] py-[0.4rem]">
        <h3 className="m-0 flex-1 text-[2rem] font-normal text-stat text-shadow-[0.15rem_0.15rem_black] mobile:text-[1.7rem]">
          {title}
        </h3>
        <button type="button" className={ui.button} onClick={onClose}>
          Back
        </button>
      </div>
      {children}
    </div>
  );
}

/** "Attack +3  Expert +2" with the wanted trees first and brighter. */
function PointsList({ points, wanted }: { points: Record<string, number>; wanted: string[] }) {
  const entries = Object.entries(points)
    .filter(([t, v]) => v !== 0 && t !== TORSO_UP_TREE)
    .sort((a, b) => Number(wanted.includes(b[0])) - Number(wanted.includes(a[0])));
  if (entries.length === 0) return null;
  return (
    <span className="flex flex-wrap gap-x-[1.2rem] text-[1.3rem]">
      {entries.map(([t, v]) => (
        <span
          key={t}
          className={cn(
            v < 0 ? "text-negative" : wanted.includes(t) ? "text-positive" : "text-white/50",
          )}
        >
          {t} {v > 0 ? `+${v}` : v}
        </span>
      ))}
    </span>
  );
}

const wantedScore = (points: Record<string, number>, wanted: string[]) =>
  wanted.reduce((n, t) => n + Math.max(0, points[t] ?? 0), 0);

type RankFilter = ArmorRank | "all";
const RANK_CHOICES: Choice<RankFilter>[] = [
  { value: "low-rank", label: "Low Rank" },
  { value: "high-rank", label: "High Rank" },
  { value: "g-rank", label: "G Rank" },
  { value: "all", label: "All ranks" },
];
type PieceSort = "skills" | "defence" | "name";
const PIECE_SORTS: Choice<PieceSort>[] = [
  { value: "skills", label: "Your skills" },
  { value: "defence", label: "Defense" },
  { value: "name", label: "Name" },
];

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

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = pieces.filter(
      (p) =>
        p.slot === slot &&
        (rankFilter === "all" || p.rank === rankFilter) &&
        suitsHunter(p, hunter.hunterType, hunter.sex) &&
        isAvailable(p.minRank, questLimit) &&
        (!ownedOnly || isOwned?.(p)) &&
        (!q ||
          p.name.toLowerCase().includes(q) ||
          Object.keys(p.points).some((t) => t.toLowerCase().includes(q))),
    );
    const by: Record<PieceSort, (a: Piece, b: Piece) => number> = {
      skills: (a, b) =>
        wantedScore(b.points, wanted) - wantedScore(a.points, wanted) ||
        b.slots - a.slots ||
        b.defence - a.defence,
      defence: (a, b) => b.defence - a.defence,
      name: (a, b) => a.name.localeCompare(b.name),
    };
    return shown.sort(
      (a, b) =>
        by[sort](a, b) || ARMOR_RANKS.indexOf(a.rank) - ARMOR_RANKS.indexOf(b.rank) || a.id - b.id,
    );
  }, [pieces, slot, rankFilter, hunter, questLimit, ownedOnly, isOwned, query, sort, wanted]);

  return (
    <PickerFrame title={`${BIN_LABELS[slot]} armor`} onClose={onClose}>
      <input
        className={ui.searchInput}
        type="search"
        aria-label="Search armor by name or skill"
        placeholder="Search by name or skill"
        value={query}
        autoComplete="off"
        spellCheck={false}
        autoFocus
        onChange={(e) => setQuery(e.target.value)}
      />
      <SelectorRow
        label="Rank"
        choices={RANK_CHOICES}
        value={rankFilter}
        onChange={setRankFilter}
      />
      <SelectorRow label="Sort by" choices={PIECE_SORTS} value={sort} onChange={setSort} />
      {isOwned && <ToggleRow label="Owned armor only" value={ownedOnly} onChange={setOwnedOnly} />}
      <p className={ui.note}>
        {hunter.hunterType}, {hunter.sex.toLowerCase()}
        {questLimit ? ", up to your quest progress" : ""}: {list.length}{" "}
        {list.length === 1 ? "piece" : "pieces"}
        {list.length > MAX_ROWS ? ` (first ${MAX_ROWS} shown; search to narrow)` : ""}.
      </p>
      <ul className="m-0 list-none p-0">
        {current && (
          <li>
            <button type="button" className={rowButton} onClick={() => onPick(null)}>
              <span />
              <span className="text-white/60">Remove {current.name}</span>
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
                  {p.name}
                  {isOwned?.(p) && (
                    <span className="ml-[0.8rem] text-[1.3rem] text-positive">Owned</span>
                  )}
                  {p.torsoUp && (
                    <span className="ml-[0.8rem] text-[1.3rem] text-white/50">Torso Up</span>
                  )}
                </span>
                <PointsList points={p.points} wanted={wanted} />
              </span>
              <span className="flex flex-col items-end text-[1.4rem]">
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
  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return decorations
      .filter(
        (d) =>
          d.slots <= free &&
          isAvailable(d.minRank, questLimit) &&
          (!q ||
            d.name.toLowerCase().includes(q) ||
            Object.keys(d.points).some((t) => t.toLowerCase().includes(q))),
      )
      .sort(
        (a, b) =>
          wantedScore(b.points, wanted) / b.slots - wantedScore(a.points, wanted) / a.slots ||
          a.name.localeCompare(b.name),
      );
  }, [decorations, free, questLimit, query, wanted]);

  return (
    <PickerFrame
      title={`${BIN_LABELS[bin]} jewel (${free} ${free === 1 ? "slot" : "slots"} free)`}
      onClose={onClose}
    >
      <input
        className={ui.searchInput}
        type="search"
        aria-label="Search decorations by name or skill"
        placeholder="Search by name or skill"
        value={query}
        autoComplete="off"
        spellCheck={false}
        autoFocus
        onChange={(e) => setQuery(e.target.value)}
      />
      <p className={ui.note}>
        {list.length} {list.length === 1 ? "decoration fits" : "decorations fit"}
        {questLimit ? ", up to your quest progress" : ""}.
      </p>
      <ul className="m-0 list-none p-0">
        {list.map((d) => (
          <li key={d.id}>
            <button type="button" className={rowButton} onClick={() => onPick(d)}>
              <Icon type="decoration" size="mini" color={d.color} alt="" />
              <span className="flex min-w-0 flex-col">
                <span className="truncate mobile:whitespace-normal">{d.name}</span>
                <PointsList points={d.points} wanted={wanted} />
              </span>
              <span className="text-[1.4rem]">
                <Slots count={d.slots} />
              </span>
            </button>
          </li>
        ))}
      </ul>
    </PickerFrame>
  );
}
