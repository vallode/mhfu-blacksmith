"use client";

/**
 * The set search's form and its options: the hunter, rank and weapon slots,
 * the sort, the toggles and the locked and excluded pieces (SearchOptions,
 * shown in a sheet), and all of it as one line (OptionsSummary).
 */
import Link from "next/link";
import Icon from "@/components/Icon";
import {
  ChoiceRow,
  IconChoiceRow,
  IconChoices,
  ToggleRow,
  type IconChoice,
} from "@/components/SettingRows";
import { cn } from "@/lib/cn";
import type { ArmorRank, WeaponType } from "@/lib/constants";
import { tierLabel, type Tier } from "@/lib/min-rank";
import { MAX_WEAPON_SLOTS } from "@/lib/set-build";
import type { Piece, SearchQuery, SortKey } from "@/lib/set-search";
import { chip, chipOff, chipOn } from "@/styles/set-builder";
import * as ui from "@/styles/settings";

export interface Form {
  skills: string[];
  hunterType: SearchQuery["hunterType"];
  sex: SearchQuery["sex"];
  rank: ArmorRank;
  weaponSlots: number;
  /** The weapon class the result's weapon suggestions show; null for the last browsed. */
  weaponClass: WeaponType | null;
  allowBadSkills: boolean;
  ownedOnly: boolean;
  /** Search armor beyond the quest progress set on the Options page. */
  ignoreQuestProgress: boolean;
  sort: SortKey;
  /** Pieces (by page link, which survives data updates) in every set. */
  locked: string[];
  /** Pieces the search leaves out. */
  excluded: string[];
}

export const DEFAULT_FORM: Form = {
  skills: [],
  hunterType: "Blademaster",
  sex: "Male",
  rank: "g-rank",
  weaponSlots: 0,
  weaponClass: null,
  allowBadSkills: false,
  ownedOnly: false,
  ignoreQuestProgress: false,
  sort: "defence",
  locked: [],
  excluded: [],
};

export const weaponIconFor = (hunterType: string) =>
  hunterType === "Gunner" ? "heavy-bowgun" : "great-sword";

const SORTS: { value: SortKey; label: string; icon?: string }[] = [
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

/** The weapon class's mini icon: grey, or green when chosen (as in the nav). */
function classIcon(type: string) {
  return function ClassIcon(checked: boolean) {
    return <Icon type={type} size="mini" nav active={checked} className="mr-0" />;
  };
}
/** Text for a choice button, centred on its letters (ui.centredText). */
function choiceText(text: string, size = "text-main") {
  return function ChoiceText() {
    return <span className={cn(ui.centredText, size)}>{text}</span>;
  };
}
const HUNTER_TYPES: IconChoice<Form["hunterType"]>[] = [
  { value: "Blademaster", label: "Blademaster", icon: classIcon("great-sword") },
  { value: "Gunner", label: "Gunner", icon: classIcon("heavy-bowgun") },
];
const SEXES: IconChoice<Form["sex"]>[] = [
  { value: "Male", label: "Male", icon: choiceText("♂") },
  { value: "Female", label: "Female", icon: choiceText("♀") },
];
const RANKS: IconChoice<ArmorRank>[] = (["low-rank", "high-rank", "g-rank"] as const).map(
  (value) => ({ value, label: RANK_LONG[value], icon: choiceText(RANK_SHORT[value], "text-sub") }),
);
const slotsLabel = (n: number) => (n === 0 ? "No slots" : n === 1 ? "1 slot" : `${n} slots`);
const SLOT_CHOICES: IconChoice<number>[] = Array.from({ length: MAX_WEAPON_SLOTS + 1 }, (_, n) => ({
  value: n,
  label: slotsLabel(n),
  icon: choiceText(n === 0 ? "-" : "O".repeat(n), "text-sub"),
}));

/** "OO-": the weapon's slots, as the game writes them. */
const slotsText = (n: number) => "O".repeat(n) + "-".repeat(MAX_WEAPON_SLOTS - n);

type Update = <K extends keyof Form>(key: K, value: Form[K]) => void;

/** The options as rows, for the options sheet. */
export function SearchOptions({
  form,
  update,
  questProgress,
  canOwnedOnly,
  piecesOf,
}: {
  form: Form;
  update: Update;
  /** The quest progress set on the Options page, if any. */
  questProgress: Tier | null;
  /** A hunter's save is loaded, so "Owned armor only" can apply. */
  canOwnedOnly: boolean;
  piecesOf: (hrefs: string[]) => Piece[];
}) {
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
      <div className="flex flex-col gap-[0.8rem]">
        <span className={ui.statusLabel}>Best first by</span>
        <SortChips value={form.sort} onChange={(v) => update("sort", v)} />
        <p className={ui.note}>Ties go to the higher defence.</p>
      </div>
      <ToggleRow
        label="Allow bad skills"
        note="Keep sets that also activate a negative skill, such as Defense -20."
        value={form.allowBadSkills}
        onChange={(v) => update("allowBadSkills", v)}
      />
      {questProgress && (
        <ToggleRow
          label="Ignore quest progress"
          note={
            <>
              Your quest progress ({tierLabel(questProgress)}, set on the{" "}
              <Link className="underline hover:text-white" href="/options/">
                Options
              </Link>{" "}
              page) leaves out armor and decorations that need materials from later quests. Turn on
              to search all of them.
            </>
          }
          value={form.ignoreQuestProgress}
          onChange={(v) => update("ignoreQuestProgress", v)}
        />
      )}
      {canOwnedOnly && (
        <ToggleRow
          label="Owned armor only"
          note="Only use armor in your hunter's equipment box."
          value={form.ownedOnly}
          onChange={(v) => update("ownedOnly", v)}
        />
      )}
      <PieceChips
        label="Always used"
        note="Every set uses these, whatever the rank or quest progress, if the hunter can wear them."
        on
        pieces={piecesOf(form.locked)}
        onRemove={(href) =>
          update(
            "locked",
            form.locked.filter((h) => h !== href),
          )
        }
      />
      <PieceChips
        label="Never used"
        note="The search never uses these."
        pieces={piecesOf(form.excluded)}
        onRemove={(href) =>
          update(
            "excluded",
            form.excluded.filter((h) => h !== href),
          )
        }
      />
    </div>
  );
}

/** Locked or excluded pieces, as chips that come off the list with a tap. */
function PieceChips({
  label,
  note,
  on,
  pieces,
  onRemove,
}: {
  label: string;
  note: string;
  on?: boolean;
  pieces: Piece[];
  onRemove: (href: string) => void;
}) {
  if (pieces.length === 0) return null;
  return (
    <div className="flex flex-col gap-[0.8rem]">
      <span className={ui.statusLabel}>{label}</span>
      <p className={ui.note}>{note}</p>
      <ul className="m-0 flex list-none flex-wrap gap-[0.6rem] p-0">
        {pieces.map((p) => (
          <li key={p.href}>
            <button
              type="button"
              className={cn(chip, on ? chipOn : chipOff, "text-fine")}
              aria-label={`Take ${p.name} off the ${label.toLowerCase()} pieces`}
              onClick={() => onRemove(p.href)}
            >
              <Icon type={p.slot} size="mini" rarity={p.rarity} className="mr-0 scale-75" />
              {p.name}
              <span className="text-sub leading-none text-white/50">×</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** What the results are sorted by, as wrapping chips. */
function SortChips({ value, onChange }: { value: SortKey; onChange: (v: SortKey) => void }) {
  return (
    <div role="radiogroup" aria-label="Best first by" className="flex flex-wrap gap-[0.6rem]">
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

/** The options in a line or two: class and sex, rank, weapon slots, sort, then the rest. */
export function OptionsSummary({ form, ownedOnly }: { form: Form; ownedOnly: boolean }) {
  const extras = [
    form.allowBadSkills && "bad skills allowed",
    form.ignoreQuestProgress && "all quests",
    ownedOnly && "owned armor",
    form.locked.length > 0 && `${form.locked.length} always used`,
    form.excluded.length > 0 && `${form.excluded.length} never used`,
  ].filter(Boolean);
  const sort = SORTS.find((x) => x.value === form.sort);
  const item = "flex items-center gap-[0.4rem] text-white";
  const key = "text-fine text-parchment";
  return (
    <span className="flex min-w-0 flex-col gap-[0.4rem]">
      <span className="flex min-w-0 flex-wrap items-center gap-x-[1.6rem] gap-y-[0.2rem]">
        <span className={item}>
          <Icon type={weaponIconFor(form.hunterType)} size="mini" className="mr-0" />
          <span className="sr-only">{form.hunterType}</span>
          <span aria-label={form.sex}>{form.sex === "Male" ? "♂" : "♀"}</span>
        </span>
        <span className={item}>
          <span className={key}>Rank</span>
          {RANK_SHORT[form.rank]}
        </span>
        <span className={item}>
          <span className={key}>Wpn</span>
          <span aria-label={slotsLabel(form.weaponSlots)}>{slotsText(form.weaponSlots)}</span>
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
