"use client";

/**
 * The set search's form and its options: the hunter, rank and weapon slots,
 * the sort, the toggles and the owned armor choice (SearchOptions, shown in a
 * sheet), and all of it as one line (OptionsSummary). The locked and excluded
 * pieces show under the skills (PieceChips).
 */
import Link from "next/link";
import Icon from "@/components/Icon";
import SlotMark from "@/components/SlotMark";
import {
  ChoiceRow,
  IconChoiceRow,
  IconChoices,
  SelectorRow,
  ToggleRow,
  type Choice,
  type IconChoice,
} from "@/components/SettingRows";
import { useT } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";
import { ARMOR_RANKS, type ArmorRank, type WeaponType } from "@/lib/constants";
import type { Messages } from "@/lib/i18n/messages";
import type { Tier } from "@/lib/min-rank";
import { MAX_WEAPON_SLOTS } from "@/lib/set-build";
import type { SearchQuery, SortKey } from "@/lib/set-search";
import { chip, chipOff, chipOn } from "@/styles/set-builder";
import * as ui from "@/styles/settings";

/** How the search treats armor the hunter has in their equipment box. */
export type OwnedArmorMode = "off" | "prefer" | "only";

export interface Form {
  skills: string[];
  hunterType: SearchQuery["hunterType"];
  sex: SearchQuery["sex"];
  rank: ArmorRank;
  weaponSlots: number;
  /** The weapon class the result's weapon suggestions show; null for the last browsed. */
  weaponClass: WeaponType | null;
  allowBadSkills: boolean;
  ownedArmor: OwnedArmorMode;
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
  ownedArmor: "off",
  ignoreQuestProgress: false,
  sort: "defence",
  locked: [],
  excluded: [],
};

export const weaponIconFor = (hunterType: string) =>
  hunterType === "Gunner" ? "heavy-bowgun" : "great-sword";

/** The sorts, in order; defence shows a shield, the resistances their element's icon. */
const SORTS: { value: SortKey; icon?: string }[] = [
  { value: "defence", icon: "defence" },
  { value: "fire", icon: "fire" },
  { value: "water", icon: "water" },
  { value: "thunder", icon: "thunder" },
  { value: "ice", icon: "ice" },
  { value: "dragon", icon: "dragon" },
  { value: "slots" },
];

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
const SEX_SIGNS: Record<Form["sex"], string> = { Male: "♂", Female: "♀" };

/** The icon choices, labelled in the site's language. */
function choicesFor(t: Messages) {
  const text = t.setBuilder;
  const hunterTypes: IconChoice<Form["hunterType"]>[] = [
    { value: "Blademaster", label: text.hunterTypes.Blademaster, icon: classIcon("great-sword") },
    { value: "Gunner", label: text.hunterTypes.Gunner, icon: classIcon("heavy-bowgun") },
  ];
  const sexes: IconChoice<Form["sex"]>[] = (["Male", "Female"] as const).map((value) => ({
    value,
    label: text.sexes[value],
    icon: choiceText(SEX_SIGNS[value]),
  }));
  const ranks: IconChoice<ArmorRank>[] = ARMOR_RANKS.map((value) => ({
    value,
    label: t.common.ranks[value],
    icon: choiceText(text.form.rankShort[value], "text-sub"),
  }));
  const slots: IconChoice<number>[] = Array.from({ length: MAX_WEAPON_SLOTS + 1 }, (_, n) => ({
    value: n,
    label: text.form.slotCount(n),
    icon:
      n === 0 ? choiceText("-", "text-sub") : () => <SlotMarks count={n} className="text-sub" />,
  }));
  return { hunterTypes, sexes, ranks, slots };
}

/** The owned armor choices, labelled in the site's language. */
export function ownedArmorChoices(t: Messages): Choice<OwnedArmorMode>[] {
  const text = t.setBuilder.form.ownedModes;
  return [
    { value: "off", label: text.off },
    { value: "prefer", label: text.prefer },
    { value: "only", label: text.only },
  ];
}

/** The weapon's slots as circles, dashes for the missing ones; the surrounding text colours them. */
function SlotMarks({ count, className }: { count: number; className?: string }) {
  return (
    <span aria-hidden="true" className={cn("inline-flex items-center", className)}>
      {Array.from({ length: MAX_WEAPON_SLOTS }, (_, i) => (
        <span key={i} className="inline-flex w-[0.9em] justify-center">
          {i < count ? <SlotMark /> : "-"}
        </span>
      ))}
    </span>
  );
}

type Update = <K extends keyof Form>(key: K, value: Form[K]) => void;

/** The options as rows, for the options sheet. */
export function SearchOptions({
  form,
  update,
  questProgress,
  canUseOwned,
}: {
  form: Form;
  update: Update;
  /** The quest progress set on the Options page, if any. */
  questProgress: Tier | null;
  /** A hunter's save is loaded, so owned armor can apply. */
  canUseOwned: boolean;
}) {
  const t = useT();
  const text = t.setBuilder.form;
  const choices = choicesFor(t);
  return (
    <div className="flex flex-col gap-[1.6rem]">
      <ChoiceRow
        label={text.hunter}
        value={text.hunterSummary(
          t.setBuilder.hunterTypes[form.hunterType],
          t.setBuilder.sexes[form.sex],
        )}
      >
        <IconChoices
          label={text.weaponClass}
          choices={choices.hunterTypes}
          value={form.hunterType}
          onChange={(v) => update("hunterType", v)}
        />
        <IconChoices
          label={text.sex}
          choices={choices.sexes}
          value={form.sex}
          onChange={(v) => update("sex", v)}
        />
      </ChoiceRow>
      <IconChoiceRow
        label={text.rank}
        choices={choices.ranks}
        value={form.rank}
        onChange={(v) => update("rank", v)}
      />
      <IconChoiceRow
        label={text.weaponSlots}
        choices={choices.slots}
        value={form.weaponSlots}
        onChange={(v) => update("weaponSlots", v)}
      />
      <div className="flex flex-col gap-[0.8rem]">
        <span className={ui.statusLabel}>{text.sortBy}</span>
        <SortChips value={form.sort} onChange={(v) => update("sort", v)} />
        <p className={ui.note}>{text.sortNote}</p>
      </div>
      <ToggleRow
        label={text.allowBadSkills}
        note={text.allowBadSkillsNote}
        value={form.allowBadSkills}
        onChange={(v) => update("allowBadSkills", v)}
      />
      {questProgress && (
        <ToggleRow
          label={text.ignoreProgress}
          note={text.ignoreProgressNote(
            t.equipment.tierLabel(questProgress),
            <Link className="underline hover:text-white" href="/options/">
              {t.common.sections.options}
            </Link>,
          )}
          value={form.ignoreQuestProgress}
          onChange={(v) => update("ignoreQuestProgress", v)}
        />
      )}
      {canUseOwned && (
        <SelectorRow
          label={text.ownedArmor}
          note={text.ownedArmorNote}
          choices={ownedArmorChoices(t)}
          value={form.ownedArmor}
          onChange={(v) => update("ownedArmor", v)}
        />
      )}
    </div>
  );
}

/** What the results are sorted by, as wrapping chips. */
function SortChips({ value, onChange }: { value: SortKey; onChange: (v: SortKey) => void }) {
  const text = useT().setBuilder.form;
  return (
    <div role="radiogroup" aria-label={text.sortBy} className="flex flex-wrap gap-[0.6rem]">
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
          {text.sorts[o.value]}
        </button>
      ))}
    </div>
  );
}

/** The options in a line or two: class and sex, rank, weapon slots, sort, then the rest. */
export function OptionsSummary({ form, ownedArmor }: { form: Form; ownedArmor: OwnedArmorMode }) {
  const text = useT().setBuilder;
  const summary = text.form.summary;
  const extras = [
    form.allowBadSkills && summary.badSkills,
    form.ignoreQuestProgress && summary.allQuests,
    ownedArmor === "prefer" && summary.ownedArmorPreferred,
    ownedArmor === "only" && summary.ownedArmorOnly,
  ].filter(Boolean);
  const sort = SORTS.find((x) => x.value === form.sort);
  const item = "flex items-center gap-[0.4rem] text-white";
  const key = "text-fine text-parchment";
  return (
    <span className="flex min-w-0 flex-col gap-[0.4rem]">
      <span className="flex min-w-0 flex-wrap items-center gap-x-[1.6rem] gap-y-[0.2rem]">
        <span className={item}>
          <Icon type={weaponIconFor(form.hunterType)} size="mini" className="mr-0" />
          <span className="sr-only">{text.hunterTypes[form.hunterType]}</span>
          <span aria-label={text.sexes[form.sex]}>{SEX_SIGNS[form.sex]}</span>
        </span>
        <span className={item}>
          <span className={key}>{summary.rank}</span>
          {text.form.rankShort[form.rank]}
        </span>
        <span className={item}>
          <span className={key}>{summary.weapon}</span>
          <span aria-label={text.form.slotCount(form.weaponSlots)}>
            <SlotMarks count={form.weaponSlots} />
          </span>
        </span>
        <span className={item}>
          {sort?.icon && (
            <img src={`/images/${sort.icon}.png`} alt="" className="size-[1.6rem] pixelated" />
          )}
          {text.form.sorts[form.sort]}
        </span>
      </span>
      {extras.length > 0 && <span className="text-fine text-white/50">{extras.join(", ")}</span>}
    </span>
  );
}
