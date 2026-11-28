"use client";

/**
 * The damage calculator's buffs: skills, items and Hunting Horn songs, in
 * the set builder's settings rows (BuffOptions, shown in a sheet), and the
 * ones that are on as one line (buffNames).
 */
import { SelectorRow, ToggleRow, type Choice } from "@/components/SettingRows";
import { useGameText, useT } from "@/context/LanguageContext";
import {
  AFFINITY_SKILLS,
  ATTACK_SKILLS,
  DEMONDRUGS,
  HORN_ATTACK,
  HORN_ELEMENT,
  LOW_HEALTH,
  SEEDS,
  type Buffs,
} from "@/lib/damage-buffs";
import type { GameText } from "@/lib/i18n/game-text";
import type { Messages } from "@/lib/i18n/messages";
import * as ui from "@/styles/settings";

type Text = Messages["motionValues"]["buffs"];

/** A selector's choices: its keys, each named by `name`. */
const choicesOf = <K extends string>(table: Record<K, unknown>, name: (k: K) => string) =>
  (Object.keys(table) as K[]).map((value): Choice<K> => ({ value, label: name(value) }));

/** Item names from the game text, "None" for none. */
const itemName =
  (text: Text, game: GameText) =>
  <K extends string>(k: K) =>
    k === "none" ? text.none : game.name("item", k);

export function BuffOptions({
  buffs,
  update,
}: {
  buffs: Buffs;
  update: <K extends keyof Buffs>(key: K, value: Buffs[K]) => void;
}) {
  const text = useT().motionValues.buffs;
  const game = useGameText();
  const item = itemName(text, game);
  return (
    <>
      <h3 className={ui.subheading}>{text.skills}</h3>
      <SelectorRow
        label={text.attackSkill}
        note={text.attackSkillNote}
        choices={choicesOf(ATTACK_SKILLS, (k) => text.attackSkills[k])}
        value={buffs.attackSkill}
        onChange={(v) => update("attackSkill", v)}
      />
      <SelectorRow
        label={text.affinitySkill}
        choices={choicesOf(AFFINITY_SKILLS, (k) => text.affinitySkills[k])}
        value={buffs.affinitySkill}
        onChange={(v) => update("affinitySkill", v)}
      />
      <SelectorRow
        label={text.lowHealth}
        note={text.lowHealthNote}
        choices={choicesOf(LOW_HEALTH, (k) => text.lowHealths[k])}
        value={buffs.lowHealth}
        onChange={(v) => update("lowHealth", v)}
      />
      <ToggleRow
        label={text.elementAttack}
        value={buffs.elementAttack}
        onChange={(v) => update("elementAttack", v)}
      />
      <ToggleRow
        label={text.sharpnessPlus}
        value={buffs.sharpnessPlus}
        onChange={(v) => update("sharpnessPlus", v)}
      />

      <h3 className={ui.subheading}>{text.items}</h3>
      <ToggleRow
        label={game.name("item", "Powercharm")}
        value={buffs.powercharm}
        onChange={(v) => update("powercharm", v)}
      />
      <ToggleRow
        label={game.name("item", "Powertalon")}
        value={buffs.powertalon}
        onChange={(v) => update("powertalon", v)}
      />
      <SelectorRow
        label={text.demondrug}
        choices={choicesOf(DEMONDRUGS, item)}
        value={buffs.demondrug}
        onChange={(v) => update("demondrug", v)}
      />
      <SelectorRow
        label={text.seed}
        note={text.seedNote}
        choices={choicesOf(SEEDS, item)}
        value={buffs.seed}
        onChange={(v) => update("seed", v)}
      />

      <h3 className={ui.subheading}>{text.horn}</h3>
      <SelectorRow
        label={text.hornAttack}
        note={text.hornAttackNote}
        choices={choicesOf(HORN_ATTACK, (k) => text.hornAttacks[k])}
        value={buffs.hornAttack}
        onChange={(v) => update("hornAttack", v)}
      />
      <SelectorRow
        label={text.hornElement}
        choices={choicesOf(HORN_ELEMENT, (k) => text.hornElements[k])}
        value={buffs.hornElement}
        onChange={(v) => update("hornElement", v)}
      />
    </>
  );
}

/** The buffs that are on, by name, in the sheet's order. */
export function buffNames(buffs: Buffs, text: Text, game: GameText): string[] {
  const item = itemName(text, game);
  return [
    buffs.attackSkill !== "none" && text.attackSkills[buffs.attackSkill],
    buffs.affinitySkill !== "none" && text.affinitySkills[buffs.affinitySkill],
    buffs.lowHealth !== "none" && text.lowHealths[buffs.lowHealth],
    buffs.elementAttack && text.elementAttack,
    buffs.sharpnessPlus && text.sharpnessPlus,
    buffs.powercharm && game.name("item", "Powercharm"),
    buffs.powertalon && game.name("item", "Powertalon"),
    buffs.demondrug !== "none" && item(buffs.demondrug),
    buffs.seed !== "none" && item(buffs.seed),
    buffs.hornAttack !== "none" && text.hornAttacks[buffs.hornAttack],
    buffs.hornElement !== "none" && text.hornElements[buffs.hornElement],
  ].filter((n): n is string => !!n);
}
