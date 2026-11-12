"use client";

/**
 * Building blocks the set builder prototypes share: a bottom sheet, the skill
 * chips and browser, the hunter options, and a result's status, pieces and
 * skills drawn for a phone-width screen.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import Card from "@/components/Card";
import Icon from "@/components/Icon";
import { Slots } from "@/components/DetailPanel";
import {
  IconChoiceRow,
  IconChoices,
  ChoiceRow,
  ToggleRow,
  type IconChoice,
} from "@/components/SettingRows";
import { cn } from "@/lib/cn";
import { ARMOR_SLOTS, type ArmorRank } from "@/lib/constants";
import { tierLabel } from "@/lib/min-rank";
import { MAX_WEAPON_SLOTS } from "@/lib/set-build";
import type { ArmorSet, DecoBin, Piece, SortKey } from "@/lib/set-search";
import * as ui from "@/styles/settings";
import type { SkillOption } from "../SkillPicker";
import type { ProtoForm, ProtoSearch } from "./useProtoSearch";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const ELEMENTS = ["fire", "water", "thunder", "ice", "dragon"] as const;

export const SORTS: { value: SortKey; label: string; icon?: string }[] = [
  { value: "defence", label: "Defence" },
  { value: "fire", label: "Fire", icon: "fire" },
  { value: "water", label: "Water", icon: "water" },
  { value: "thunder", label: "Thunder", icon: "thunder" },
  { value: "ice", label: "Ice", icon: "ice" },
  { value: "dragon", label: "Dragon", icon: "dragon" },
  { value: "slots", label: "Free slots" },
];

const RANK_SHORT: Record<ArmorRank, string> = {
  "low-rank": "LR",
  "high-rank": "HR",
  "g-rank": "G",
};
const RANK_LONG: Record<ArmorRank, string> = {
  "low-rank": "Low Rank",
  "high-rank": "High Rank",
  "g-rank": "G Rank",
};

const SLOT_LABELS: Record<DecoBin, string> = {
  weapon: "Weapon",
  helmet: "Head",
  plate: "Chest",
  gauntlets: "Arms",
  waist: "Waist",
  leggings: "Legs",
};

export const rarityColor = (rarity?: number) =>
  rarity ? `var(--color-rarity-${Math.min(10, Math.max(4, rarity))})` : undefined;

export const weaponIconFor = (hunterType: string) =>
  hunterType === "Gunner" ? "heavy-bowgun" : "great-sword";

/** A pressable row or tile: green glow on hover/focus, like the site's lists. */
export const pressable =
  "cursor-pointer border-none bg-transparent p-0 text-left font-[inherit] text-[inherit] hover:hover-glow focus-visible:hover-glow focus-visible:outline-none active:hover-glow";

/** A small framed chip (skills, sorts). */
export const chip =
  "inline-flex min-h-[3.6rem] flex-none cursor-pointer items-center gap-[0.6rem] border-2 px-[1rem] font-[inherit] text-small leading-none shadow-[0.2rem_0.2rem_0_black] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white";
export const chipOn = "border-stat bg-stat/20 text-stat";
export const chipOff = "border-white/25 bg-black/40 text-white/75 hover:border-stat/60";

/** The big button of an action bar. */
export const primaryButton =
  "flex min-h-[4.8rem] flex-1 cursor-pointer items-center justify-center gap-[1rem] border-2 border-stat bg-accent px-[1.6rem] font-[inherit] text-sub text-white shadow-[0.2rem_0.2rem_0_black] text-shadow-[0.15rem_0.15rem_black] enabled:hover:hover-glow disabled:cursor-default disabled:border-white/25 disabled:bg-line disabled:text-white/40";
export const secondaryButton =
  "flex min-h-[4.8rem] flex-none cursor-pointer items-center justify-center border-2 border-white/30 bg-line px-[1.6rem] font-[inherit] text-small text-white/75 shadow-[0.2rem_0.2rem_0_black] hover:border-white/60";

// ---------------------------------------------------------------------------
// Sheet
// ---------------------------------------------------------------------------

/** The overlays' frame: the blue of the 3D model popover, the site's other overlay. */
const FRAME = "blue" as const;

/**
 * A card over the page, in the overlays' blue frame and the fill of the
 * site's phone sheets (SplitPage). On phones it rises from the bottom edge,
 * over the tab bar; on wider screens it is a dialog in the middle of the
 * page. Closed by ×, Escape or a tap on the dimmed page. `tall` makes it
 * nearly full height (pickers), otherwise it fits its content.
 */
export function Sheet({
  open,
  onClose,
  title,
  tall,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  tall?: boolean;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const before = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-900 flex flex-col items-center justify-center p-[2.4rem] mobile:justify-end mobile:p-0">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className="absolute inset-0 cursor-default border-none bg-black/65 p-0"
        onClick={onClose}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        className={cn(
          "relative flex min-h-0 w-full max-w-[64rem] flex-col outline-none [--card-fill:var(--color-sheet)]",
          "motion-safe:animate-toast-in mobile:max-w-none mobile:motion-safe:animate-sheet-in",
          tall ? "h-[min(80dvh,80rem)] mobile:h-[92dvh]" : "max-h-[80dvh] mobile:max-h-[85dvh]",
        )}
      >
        <Card
          frame={FRAME}
          className="flex-[1_1_auto] text-small"
          bodyClassName="card-p-7 gap-[1.2rem]"
        >
          <div className="flex flex-none items-center gap-[1rem]">
            <h2 className="m-0 min-w-0 flex-1 truncate text-main font-normal text-stat text-shadow-[0.15rem_0.15rem_black]">
              {title}
            </h2>
            <button
              type="button"
              aria-label="Close"
              className="-my-[0.8rem] flex size-[4.4rem] flex-none cursor-pointer items-center justify-center border-none bg-transparent p-0 text-[3rem] leading-none text-white/60 hover:text-white"
              onClick={onClose}
            >
              ×
            </button>
          </div>
          <div className="-mx-[0.4rem] flex min-h-0 flex-1 flex-col gap-[1.3rem] overflow-y-auto overscroll-contain px-[0.4rem]">
            {children}
          </div>
          {footer && (
            <div className="flex flex-none gap-[0.8rem] mobile:mb-[env(safe-area-inset-bottom)]">
              {footer}
            </div>
          )}
        </Card>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Skills
// ---------------------------------------------------------------------------

/** Pick a skill: replaces one of the same tree, or removes it if chosen. */
export function toggleSkill(value: string[], skill: SkillOption, all: SkillOption[]): string[] {
  if (value.includes(skill.name)) return value.filter((v) => v !== skill.name);
  const treeOf = new Map(all.map((s) => [s.name, s.tree]));
  const same = value.findIndex((v) => treeOf.get(v) === skill.tree);
  return same >= 0 ? value.map((v, i) => (i === same ? skill.name : v)) : [...value, skill.name];
}

/** The chosen skills as removable chips, and an "add" chip. */
export function SkillChips({
  value,
  onRemove,
  onAdd,
  addLabel = "+ Skill",
}: {
  value: string[];
  onRemove: (name: string) => void;
  onAdd?: () => void;
  addLabel?: string;
}) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-[0.8rem] p-0">
      {value.map((name) => (
        <li key={name} className={cn(chip, chipOn, "cursor-default pr-0")}>
          <span>{name}</span>
          <button
            type="button"
            aria-label={`Remove ${name}`}
            className="flex h-[3.2rem] w-[3.2rem] cursor-pointer items-center justify-center border-none bg-transparent p-0 text-sub leading-none text-stat/70 hover:text-negative"
            onClick={() => onRemove(name)}
          >
            ×
          </button>
        </li>
      ))}
      {onAdd && (
        <li>
          <button type="button" className={cn(chip, chipOff, "border-dashed")} onClick={onAdd}>
            {addLabel}
          </button>
        </li>
      )}
    </ul>
  );
}

/**
 * Every skill, by tree, like the game's menus: each tree a grey title bar
 * with its activations as rows under it, a yellow box at the left filled
 * when chosen. Tap a row to choose it (it replaces another from the same
 * tree), tap again to drop it. The filter box and what's chosen stay at the
 * top while the list scrolls; the list keeps its order as you choose.
 */
export function SkillBrowser({
  skills,
  value,
  onChange,
  autoFocus,
}: {
  skills: SkillOption[];
  value: string[];
  onChange: (value: string[]) => void;
  autoFocus?: boolean;
}) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byTree = new Map<string, SkillOption[]>();
    for (const s of skills) {
      if (q && !s.name.toLowerCase().includes(q) && !s.tree.toLowerCase().includes(q)) continue;
      byTree.set(s.tree, [...(byTree.get(s.tree) ?? []), s]);
    }
    return [...byTree.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [skills, query]);

  return (
    <div className="flex flex-col gap-[1.6rem]">
      <div className="sticky top-0 z-1 -mx-[0.4rem] flex flex-col gap-[0.8rem] bg-sheet px-[0.4rem] pb-[0.8rem]">
        <input
          className={cn(ui.searchInput, "min-h-[4.4rem] text-sub")}
          type="search"
          aria-label="Filter skills"
          placeholder="Filter, e.g. attack, evade"
          value={query}
          autoComplete="off"
          spellCheck={false}
          autoFocus={autoFocus}
          onChange={(e) => setQuery(e.target.value)}
        />
        <p className="m-0 truncate text-fine text-white/60">
          {value.length === 0 ? (
            "Nothing chosen yet."
          ) : (
            <>
              Chosen: <span className="text-stat">{value.join(", ")}</span>
            </>
          )}
        </p>
      </div>
      {groups.length === 0 && <p className={ui.note}>No skill matches “{query}”.</p>}
      {groups.map(([tree, list]) => {
        const chosen = list.some((s) => value.includes(s.name));
        return (
          <section key={tree} className="flex flex-col" aria-label={tree}>
            <h3
              className={cn(
                "m-0 flex items-center justify-between border-b-[3px] bg-selector px-[1rem] py-[0.6rem] text-small font-normal text-shadow-[0.15rem_0.15rem_black]",
                chosen ? "border-stat text-stat" : "border-white/30 text-parchment",
              )}
            >
              {tree}
            </h3>
            <ul className="m-0 list-none bg-black/25 p-0">
              {list.map((s) => {
                const on = value.includes(s.name);
                return (
                  <li key={s.name}>
                    <button
                      type="button"
                      aria-pressed={on}
                      className={cn(
                        pressable,
                        "grid min-h-[4.6rem] w-full grid-cols-[2.2rem_minmax(0,1fr)_auto] items-center gap-x-[1.2rem] border-b border-white/10 px-[1rem]",
                      )}
                      onClick={() => onChange(toggleSkill(value, s, skills))}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-[2.2rem] border-[3px] border-stat shadow-[0.2rem_0.2rem_0_black]",
                          on ? "bg-stat" : "bg-transparent",
                        )}
                      />
                      <span className={cn("truncate text-sub", on ? "text-stat" : "text-white")}>
                        {s.name}
                      </span>
                      <span className="text-fine text-white/45">{s.points} pts</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Hunter options
// ---------------------------------------------------------------------------

function classIcon(type: string) {
  return function ClassIcon(checked: boolean) {
    return <Icon type={type} size="mini" nav active={checked} className="mr-0" />;
  };
}
function text(t: string, size = "text-main") {
  return function Text() {
    return <span className={cn(ui.centredText, size)}>{t}</span>;
  };
}
const HUNTER_TYPES: IconChoice<ProtoForm["hunterType"]>[] = [
  { value: "Blademaster", label: "Blademaster", icon: classIcon("great-sword") },
  { value: "Gunner", label: "Gunner", icon: classIcon("heavy-bowgun") },
];
const SEXES: IconChoice<ProtoForm["sex"]>[] = [
  { value: "Male", label: "Male", icon: text("♂") },
  { value: "Female", label: "Female", icon: text("♀") },
];
const RANKS: IconChoice<ArmorRank>[] = (["low-rank", "high-rank", "g-rank"] as const).map(
  (value) => ({ value, label: RANK_LONG[value], icon: text(RANK_SHORT[value], "text-sub") }),
);
const SLOT_CHOICES: IconChoice<number>[] = Array.from({ length: MAX_WEAPON_SLOTS + 1 }, (_, n) => ({
  value: n,
  label: n === 0 ? "No slots" : `${n} slot${n > 1 ? "s" : ""}`,
  icon: text(n === 0 ? "-" : "O".repeat(n), "text-sub"),
}));

export const slotsText = (n: number) => "O".repeat(n) + "-".repeat(MAX_WEAPON_SLOTS - n);

/** The hunter's options as rows: class and sex, rank, weapon slots, toggles. */
export function OptionsForm({ s, withSort }: { s: ProtoSearch; withSort?: boolean }) {
  const { form, update, questProgress } = s;
  return (
    <div className="flex flex-col gap-[1.6rem]">
      <ChoiceRow label="Hunter" value={`${form.hunterType}, ${form.sex.toLowerCase()}`}>
        <IconChoices
          label="Weapon class"
          choices={HUNTER_TYPES}
          value={form.hunterType}
          onChange={(v) => update("hunterType", v)}
        />
        <IconChoices
          label="Sex"
          choices={SEXES}
          value={form.sex}
          onChange={(v) => update("sex", v)}
        />
      </ChoiceRow>
      <IconChoiceRow
        label="Armor up to"
        choices={RANKS}
        value={form.rank}
        onChange={(v) => update("rank", v)}
      />
      <IconChoiceRow
        label="Weapon slots"
        choices={SLOT_CHOICES}
        value={form.weaponSlots}
        onChange={(v) => update("weaponSlots", v)}
      />
      {withSort && (
        <div className="flex flex-col gap-[0.8rem]">
          <span className={ui.statusLabel}>Best first by</span>
          <SortChips value={form.sort} onChange={(v) => update("sort", v)} wrap />
        </div>
      )}
      <ToggleRow
        label="Allow bad skills"
        note="Keep sets that also activate a negative skill."
        value={form.allowBadSkills}
        onChange={(v) => update("allowBadSkills", v)}
      />
      {questProgress && (
        <ToggleRow
          label="Ignore quest progress"
          note={`Search armor past ${tierLabel(questProgress)} too.`}
          value={form.ignoreQuestProgress}
          onChange={(v) => update("ignoreQuestProgress", v)}
        />
      )}
      <PinnedPieces s={s} />
    </div>
  );
}

/** Locked and excluded pieces, as chips that come off with a tap. */
export function PinnedPieces({ s }: { s: ProtoSearch }) {
  const { form, piecesOf, update } = s;
  const lists = [
    { key: "locked" as const, label: "Locked in every set", pieces: piecesOf(form.locked) },
    { key: "excluded" as const, label: "Never used", pieces: piecesOf(form.excluded) },
  ];
  return (
    <>
      {lists.map(
        ({ key, label, pieces }) =>
          pieces.length > 0 && (
            <div key={key} className="flex flex-col gap-[0.8rem]">
              <span className={ui.statusLabel}>{label}</span>
              <ul className="m-0 flex list-none flex-wrap gap-[0.6rem] p-0">
                {pieces.map((p) => (
                  <li key={p.href}>
                    <button
                      type="button"
                      className={cn(chip, key === "locked" ? chipOn : chipOff, "text-fine")}
                      aria-label={`Take ${p.name} off the list`}
                      onClick={() =>
                        update(
                          key,
                          form[key].filter((h) => h !== p.href),
                        )
                      }
                    >
                      <Icon type={p.slot} size="mini" rarity={p.rarity} className="mr-0 scale-75" />
                      {p.name}
                      <span className="text-sub leading-none text-white/50">×</span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ),
      )}
    </>
  );
}

/** The options in one line: "⚔ ♂ · G · OO- · Defence". */
export function OptionsSummary({ form }: { form: ProtoForm }) {
  const extras = [
    form.allowBadSkills && "bad skills ok",
    form.ignoreQuestProgress && "all quests",
    form.locked.length > 0 && `${form.locked.length} locked`,
    form.excluded.length > 0 && `${form.excluded.length} excluded`,
  ].filter(Boolean);
  const sort = SORTS.find((x) => x.value === form.sort);
  const item = "flex items-center gap-[0.4rem] text-white";
  const key = "text-fine text-parchment";
  return (
    <span className="flex min-w-0 flex-col gap-[0.4rem]">
      <span className="flex min-w-0 flex-wrap items-center gap-x-[1.6rem] gap-y-[0.2rem]">
        <span className={item}>
          <Icon type={weaponIconFor(form.hunterType)} size="mini" className="mr-0" />
          {form.sex === "Male" ? "♂" : "♀"}
        </span>
        <span className={item}>
          <span className={key}>Rank</span>
          {RANK_SHORT[form.rank]}
        </span>
        <span className={item}>
          <span className={key}>Wpn</span>
          {slotsText(form.weaponSlots)}
        </span>
        <span className={item}>
          {sort?.icon && (
            <img src={`/images/${sort.icon}.png`} alt="" className="size-[1.6rem] pixelated" />
          )}
          {sort?.label}
        </span>
      </span>
      {extras.length > 0 && <span className="text-fine text-white/50">{extras.join(", ")}</span>}
    </span>
  );
}

/** What the results are sorted by, as a scrolling row of chips. */
export function SortChips({
  value,
  onChange,
  wrap,
}: {
  value: SortKey;
  onChange: (v: SortKey) => void;
  wrap?: boolean;
}) {
  return (
    <div
      role="radiogroup"
      aria-label="Best first by"
      className={cn(
        "flex gap-[0.6rem]",
        wrap
          ? "flex-wrap"
          : "-mx-[0.4rem] [scrollbar-width:none] overflow-x-auto px-[0.4rem] pb-[0.6rem]",
      )}
    >
      {SORTS.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={o.value === value}
          className={cn(chip, o.value === value ? chipOn : chipOff)}
          onClick={() => onChange(o.value)}
        >
          {o.icon && (
            <img src={`/images/${o.icon}.png`} alt="" className="size-[1.6rem] pixelated" />
          )}
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// A result
// ---------------------------------------------------------------------------

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const resColor = (n: number) => (n > 0 ? "text-positive" : n < 0 ? "text-negative" : "text-white");

/** Defence, big, then the five resistances as element icons. */
export function StatusStrip({
  set,
  sort,
  compact,
}: {
  set: Pick<ArmorSet, "defence" | "res" | "freeSlots">;
  sort?: SortKey;
  compact?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-[1.4rem]", compact && "gap-[1rem]")}>
      <div
        className={cn(
          "flex flex-none flex-col items-start leading-none",
          sort === "defence" && "text-stat",
        )}
      >
        <span className="text-fine text-parchment">DEF</span>
        <span
          className={cn(
            "text-shadow-[0.15rem_0.15rem_black]",
            compact ? "text-sub" : "text-[2.8rem]",
            sort === "defence" ? "text-stat" : "text-white",
          )}
        >
          {set.defence}
        </span>
      </div>
      <ul
        className={cn(
          "m-0 grid min-w-0 flex-1 list-none grid-cols-5 p-0",
          compact ? "gap-[0.2rem]" : "gap-[0.4rem]",
        )}
        aria-label="Resistances"
      >
        {ELEMENTS.map((el, i) => (
          <li
            key={el}
            className={cn(
              "flex flex-col items-center gap-[0.2rem] py-[0.2rem]",
              sort === el && "bg-stat/15 outline outline-stat/60",
            )}
          >
            <img src={`/images/${el}.png`} alt={el} className="size-[1.6rem] pixelated" />
            <span className={cn("text-fine leading-none", resColor(set.res[i]))}>
              {signed(set.res[i])}
            </span>
          </li>
        ))}
      </ul>
      {!compact && (
        <div
          className={cn(
            "flex flex-none flex-col items-end leading-none",
            sort === "slots" && "text-stat",
          )}
        >
          <span className="text-fine text-parchment">Free</span>
          <span className={cn("text-sub", sort === "slots" ? "text-stat" : "text-white")}>
            {set.freeSlots}
          </span>
        </div>
      )}
    </div>
  );
}

/** Decorations in a bin, with repeats counted: "Fierce Jewel ×2". */
function decoSummary(set: Pick<ArmorSet, "decorations">, bin: DecoBin) {
  const counts = new Map<string, { name: string; color?: string; n: number }>();
  for (const { deco, bin: b } of set.decorations) {
    if (b !== bin) continue;
    const c = counts.get(deco.name) ?? { name: deco.name, color: deco.color, n: 0 };
    c.n++;
    counts.set(deco.name, c);
  }
  return [...counts.values()];
}

function DecoLine({ set, bin }: { set: Pick<ArmorSet, "decorations">; bin: DecoBin }) {
  const decos = decoSummary(set, bin);
  if (decos.length === 0) return null;
  return (
    <span className="flex flex-wrap items-center gap-x-[1rem] text-fine text-white/65">
      {decos.map((d) => (
        <span key={d.name} className="flex items-center">
          <Icon type="decoration" size="mini" color={d.color} className="mr-[0.2rem] scale-75" />
          {d.name}
          {d.n > 1 && <span className="ml-[0.4rem] text-white/45">×{d.n}</span>}
        </span>
      ))}
    </span>
  );
}

/**
 * The set's weapon and pieces as full-width rows (5.2rem+ tall, easy to tap):
 * icon, name and its jewels under it, slots at the right. Tapping a piece
 * opens its sheet (lock, exclude, swaps).
 */
export function PieceRows({
  set,
  weaponSlots,
  hunterType,
  isLocked,
  onPiece,
}: {
  set: ArmorSet;
  weaponSlots: number;
  hunterType: string;
  isLocked: (p: Piece) => boolean;
  onPiece: (p: Piece, index: number) => void;
}) {
  const row =
    "grid min-h-[5.2rem] w-full grid-cols-[3.2rem_minmax(0,1fr)_auto] items-center gap-x-[1rem] border-b border-white/10 px-[0.6rem] py-[0.6rem]";
  return (
    <ul className="m-0 list-none p-0">
      <li className={cn(row, decoSummary(set, "weapon").length === 0 && "min-h-[4rem]")}>
        <Icon type={weaponIconFor(hunterType)} size="mini" className="mr-0" />
        <span className="flex min-w-0 flex-col gap-[0.2rem]">
          <span className="text-small text-white/55">Weapon</span>
          <DecoLine set={set} bin="weapon" />
        </span>
        <span className="text-fine">
          <Slots count={weaponSlots} />
        </span>
      </li>
      {ARMOR_SLOTS.map((slot) => {
        const i = set.pieces.findIndex((p) => p.slot === slot);
        const p = set.pieces[i];
        if (!p) return null;
        const locked = isLocked(p);
        const alts = set.alternatives[i]?.length ?? 0;
        return (
          <li key={slot}>
            <button
              type="button"
              className={cn(pressable, row)}
              aria-label={`${SLOT_LABELS[slot]}: ${p.name}. Options`}
              onClick={() => onPiece(p, i)}
            >
              <Icon type={slot} size="mini" rarity={p.rarity} alt="" className="mr-0" />
              <span className="flex min-w-0 flex-col gap-[0.2rem]">
                <span className="flex min-w-0 items-center gap-[0.8rem]">
                  <span className="truncate text-sub text-white">{p.name}</span>
                  {locked && (
                    <span className="flex-none border border-stat px-[0.4rem] text-fine leading-[1.3] text-stat">
                      Locked
                    </span>
                  )}
                  {alts > 0 && <span className="flex-none text-fine text-white/40">+{alts}</span>}
                </span>
                <DecoLine set={set} bin={slot} />
              </span>
              <span className="flex items-center gap-[0.8rem] text-fine">
                <Slots count={p.slots} />
                <span className="text-sub leading-none text-white/35" aria-hidden="true">
                  ›
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** The activated skills as one wrapped line: wanted in yellow, extras in white, bad in red. */
export function SkillLine({
  set,
  wanted,
  limit,
}: {
  set: Pick<ArmorSet, "skills">;
  wanted: string[];
  limit?: number;
}) {
  const shown = limit ? set.skills.slice(0, limit) : set.skills;
  const more = set.skills.length - shown.length;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-[1.2rem] gap-y-[0.4rem] p-0 text-small">
      {shown.map((sk) => (
        <li
          key={sk.tree}
          className={cn(
            sk.threshold < 0
              ? "text-negative"
              : wanted.includes(sk.name)
                ? "text-stat"
                : "text-white/80",
          )}
        >
          {sk.name}
        </li>
      ))}
      {more > 0 && <li className="text-white/40">+{more} more</li>}
    </ul>
  );
}

/** A piece's sheet: what it gives, and lock, exclude, swaps and its page. */
export function PieceSheet({
  s,
  piece,
  set,
  index,
  onClose,
}: {
  s: ProtoSearch;
  piece: Piece | null;
  set: ArmorSet | null;
  index: number;
  onClose: () => void;
}) {
  const p = piece;
  const locked = p ? s.isLocked(p) : false;
  const alts = (set && set.alternatives[index]) ?? [];
  const points = p ? Object.entries(p.points).filter(([, v]) => v !== 0) : [];
  return (
    <Sheet
      open={!!p}
      onClose={onClose}
      title={
        p && (
          <span className="flex items-center gap-[0.8rem]">
            <Icon type={p.slot} size="mini" rarity={p.rarity} className="mr-0" />
            <span className="truncate" style={{ color: rarityColor(p.rarity) }}>
              {p.name}
            </span>
          </span>
        )
      }
      footer={
        p && (
          <>
            <button
              type="button"
              className={cn(primaryButton, locked && "border-white/40 bg-line")}
              onClick={() => {
                s.toggleLock(p);
                onClose();
              }}
            >
              {locked ? "Unlock" : "Always use"}
            </button>
            <button
              type="button"
              className={cn(secondaryButton, "hover:border-negative hover:text-negative")}
              onClick={() => {
                s.exclude(p);
                onClose();
              }}
            >
              Never use
            </button>
          </>
        )
      }
    >
      {p && set && (
        <>
          <dl className="m-0 grid grid-cols-[max-content_1fr] gap-x-[1.6rem] gap-y-[0.6rem] text-small">
            <dt className="text-stat">Defense</dt>
            <dd className="m-0 text-white">{p.defence}</dd>
            <dt className="text-stat">Slots</dt>
            <dd className="m-0">
              <Slots count={p.slots} />
            </dd>
            <dt className="text-stat">Skills</dt>
            <dd className="m-0 flex flex-wrap gap-x-[1.2rem]">
              {points.map(([tree, v]) => (
                <span key={tree} className={v < 0 ? "text-negative" : "text-white"}>
                  {tree} {signed(v)}
                </span>
              ))}
            </dd>
            <dt className="text-stat">Jewels</dt>
            <dd className="m-0">
              {decoSummary(set, p.slot).length ? <DecoLine set={set} bin={p.slot} /> : "-"}
            </dd>
          </dl>
          {alts.length > 0 && (
            <div className="flex flex-col gap-[0.6rem]">
              <span className={ui.statusLabel}>Swaps that keep your skills</span>
              <ul className="m-0 flex list-none flex-col p-0">
                {alts.map((a) => (
                  <li key={a.id}>
                    <Link
                      href={a.href}
                      className={cn(
                        pressable,
                        "flex min-h-[4.4rem] items-center gap-[0.8rem] border-b border-white/10 px-[0.4rem] text-small",
                      )}
                    >
                      <Icon type={a.slot} size="mini" rarity={a.rarity} className="mr-0 scale-75" />
                      <span className="flex-1 truncate">{a.name}</span>
                      <span className="text-fine text-white/50">DEF {a.defence}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Link href={p.href} className="text-small text-white/70 underline hover:text-white">
            Open {p.name}&apos;s page
          </Link>
        </>
      )}
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Status messages
// ---------------------------------------------------------------------------

/** What to say when there is no set to show (or while searching). */
export function searchMessage(s: ProtoSearch): React.ReactNode {
  const { loadError, data, error, searching, found, result, sets, query } = s;
  if (loadError) return <p className={ui.error}>Couldn&apos;t load the armor data.</p>;
  if (!data) return <p className={ui.note}>Loading armor…</p>;
  if (error) return <p className={ui.error}>{error}</p>;
  if (searching) return <p className={ui.note}>Searching… {found ? `${found} sets so far` : ""}</p>;
  if (!result) return null;
  if (sets.length === 0)
    return (
      <p className={ui.note}>
        No set activates all of these skills. Try fewer skills, a higher rank or more weapon slots
        {query?.lockPieces?.length ? ", or unlock pieces" : ""}.
      </p>
    );
  return null;
}

// ---------------------------------------------------------------------------
// The action bar
// ---------------------------------------------------------------------------

/** A bar that sticks above the phone's tab bar (and to the bottom elsewhere). */
export function ActionBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="sticky bottom-[1.6rem] z-20 flex gap-[0.8rem] mobile:bottom-[calc(var(--spacing-tabbar)+env(safe-area-inset-bottom)+0.8rem)]">
      {children}
    </div>
  );
}

/**
 * Search, as the bar's big button: says what it will do ("Search 3 skills",
 * "Update results"), and turns into progress and Cancel while it runs.
 * Hidden when the results already match the form, unless `always`.
 */
export function SearchBar({
  s,
  always,
  onSearched,
  before,
}: {
  s: ProtoSearch;
  always?: boolean;
  onSearched?: () => void;
  /** Another button at the left (Back, Edit). */
  before?: React.ReactNode;
}) {
  const { searching, found, cancel, stale, form, data, result, run } = s;
  if (!always && !searching && !stale && !before) return null;
  const n = form.skills.length;
  return (
    <ActionBar>
      {before}
      {searching ? (
        <>
          <div className={cn(primaryButton, "cursor-default border-white/40 bg-line")}>
            <img src="/images/loading.gif" alt="" className="h-[2.4rem] w-auto" />
            Searching… {found > 0 && <span className="text-stat">{found}</span>}
          </div>
          <button type="button" className={secondaryButton} onClick={cancel}>
            Cancel
          </button>
        </>
      ) : (
        <button
          type="button"
          className={primaryButton}
          disabled={!data || n === 0 || (!stale && !always)}
          onClick={() => {
            run();
            onSearched?.();
          }}
        >
          {n === 0
            ? "Pick a skill to search"
            : !stale
              ? "Search again"
              : result
                ? "Update results"
                : `Search ${n} skill${n > 1 ? "s" : ""}`}
        </button>
      )}
    </ActionBar>
  );
}
