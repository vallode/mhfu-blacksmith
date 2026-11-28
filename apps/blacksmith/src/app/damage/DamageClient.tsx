"use client";

/**
 * The damage calculator (/damage/): a weapon, the hunter's buffs, and what
 * each of the weapon's moves (a bowgun's shots) deals on a hitzone or a
 * monster's part. Laid out as the set builder: the weapon, the buffs and the
 * target in a card on the left (on phones, above), each opening a sheet,
 * with how the weapon is used (sharpness, modes) under them; the damage
 * table beside them. The weapon is in the URL (`?weapon=<type>/<slug>`), so the
 * weapon pages link here; it and the buffs are remembered in the browser.
 */
import { useCallback, useEffect, useState } from "react";
import Card from "@/components/Card";
import CardBox from "@/components/CardBox";
import Icon from "@/components/Icon";
import Loading from "@/components/Loading";
import MotionDamage, { MotionSettings } from "@/components/motion-values/MotionDamage";
import ShotDamage from "@/components/motion-values/ShotDamage";
import { useGameText, useLocale, useT } from "@/context/LanguageContext";
import { useHitzoneState } from "@/components/motion-values/hitzone-state";
import {
  HitzoneBar,
  TargetPicker,
  TargetSummary,
  useTarget,
} from "@/components/motion-values/TargetPicker";
import { useWeaponSettings } from "@/components/motion-values/weapon-settings";
import { weakestPart } from "@/components/motion-values/HitzonePicker";
import { getQuests, useHitzoneMonsters, useWeaponOrNull } from "@/lib/client-data";
import type { Quest } from "@/lib/quests";
import { cn } from "@/lib/cn";
import { buffedAttack, NO_BUFFS, type Buffs } from "@/lib/damage-buffs";
import {
  parseWeaponKey,
  readDamageState,
  WEAPON_PARAM,
  weaponKey,
  writeDamageState,
  type WeaponRef,
} from "@/lib/damage-store";
import { menuRow, pressable, textButton } from "@/styles/set-builder";
import { PanelTitle } from "../set-builder/ArmorSetView";
import Sheet from "../set-builder/Sheet";
import { BuffOptions, buffNames } from "./BuffOptions";
import QuestPicker, { questMonsters } from "./QuestPicker";
import WeaponPicker from "./WeaponPicker";

type SheetName = "weapon" | "buffs" | "quest" | "target" | null;

/**
 * The stored quest, once quests.json (loaded only for it) is in; `missing`
 * when the ID isn't there or the file couldn't load.
 */
function useStoredQuest(id: number | null): { quest: Quest | null; missing: boolean } {
  const [quests, setQuests] = useState<Quest[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (id === null || quests) return;
    let cancelled = false;
    getQuests().then(
      (q) => !cancelled && setQuests(q),
      () => !cancelled && setFailed(true),
    );
    return () => {
      cancelled = true;
    };
  }, [id, quests]);
  const quest = (id !== null && quests?.find((q) => q.id === id)) || null;
  return { quest, missing: id !== null && !quest && (failed || !!quests) };
}

export default function DamageClient() {
  const t = useT();
  const text = t.motionValues.page;
  const game = useGameText();
  const { formatNumber } = useLocale();
  const [weaponRef, setWeaponRef] = useState<WeaponRef | null>(null);
  const [buffs, setBuffs] = useState<Buffs>(NO_BUFFS);
  const [questId, setQuestId] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [sheet, setSheet] = useState<SheetName>(null);
  const closeSheet = useCallback(() => setSheet(null), []);
  // The hitzone, the bestiary's monster and how the weapon is used stay
  // when the weapon changes.
  const hitzone = useHitzoneState();
  const settings = useWeaponSettings();

  // After mount: the URL's weapon, else the last one; the remembered buffs.
  useEffect(() => {
    const stored = readDamageState();
    const fromUrl = parseWeaponKey(new URLSearchParams(location.search).get(WEAPON_PARAM));
    setWeaponRef(fromUrl ?? stored.weapon);
    setBuffs(stored.buffs);
    setQuestId(stored.quest);
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    writeDamageState({ weapon: weaponRef, buffs, quest: questId });
    // The URL names the weapon, so the page can be shared or reloaded as is.
    const url = new URL(location.href);
    if (weaponRef) url.searchParams.set(WEAPON_PARAM, weaponKey(weaponRef));
    else url.searchParams.delete(WEAPON_PARAM);
    const next = url.pathname + url.search.replace("%2F", "/") + url.hash;
    if (next !== location.pathname + location.search + location.hash)
      history.replaceState(history.state, "", next);
  }, [loaded, weaponRef, buffs, questId]);

  const { item: weapon, loading } = useWeaponOrNull(
    weaponRef?.type ?? null,
    weaponRef?.slug ?? null,
  );
  const update = useCallback(
    <K extends keyof Buffs>(key: K, value: Buffs[K]) => setBuffs((b) => ({ ...b, [key]: value })),
    [],
  );
  const target = useTarget(weaponRef?.type ?? null, weapon);
  const { quest, missing: questMissing } = useStoredQuest(questId);
  // A stored quest that's gone (or quests.json that won't load) lets go.
  useEffect(() => {
    if (questMissing) setQuestId(null);
  }, [questMissing]);
  const { monsters } = useHitzoneMonsters();
  const spotMonster = hitzone.spot && monsters?.find((m) => m.slug === hitzone.spot!.slug);
  // The quest's multipliers for the monster struck; set by hand, its first.
  const questStats = quest
    ? spotMonster
      ? quest.monsterStats.find((s) => s.monster.name === spotMonster.name)
      : quest.monsterStats[0]
    : undefined;
  const defense = questStats?.defense ?? 1;
  const pickQuest = (q: Quest) => {
    setQuestId(q.id);
    setSheet(null);
    // A monster not in the quest gives way to the quest's first that has hitzones.
    const names = questMonsters(q);
    if (spotMonster && names.includes(spotMonster.name)) return;
    const first = monsters?.find((m) => names.includes(m.name));
    if (first && target) hitzone.setSpot(weakestPart(first, target.valueOf));
  };
  const on = buffNames(buffs, t.motionValues.buffs, game);
  const shots = weaponRef?.type === "light-bowgun" || weaponRef?.type === "heavy-bowgun";

  return (
    <>
      {/* From 900px up the page is the window's height: the calculator card
          fills it and scrolls inside, so picking things doesn't move it. */}
      <div className="flex w-full flex-col gap-[1.3rem] pb-[1.6rem] min-[900px]:grid min-[900px]:h-full min-[900px]:grid-cols-[34rem_minmax(0,1fr)] min-[900px]:grid-rows-[minmax(0,1fr)] min-[900px]:pb-0 wide:grid-cols-[40rem_minmax(0,1fr)]">
        <CardBox className="flex-none min-[900px]:self-start">
          <Card className="text-small" bodyClassName="card-py-7 gap-[1.2rem]">
            <PanelTitle>{text.title}</PanelTitle>
            <div className="flex flex-col border-t border-white/15">
              <button
                type="button"
                className={cn(pressable, menuRow, "min-h-[5.6rem]")}
                aria-haspopup="dialog"
                onClick={() => setSheet("weapon")}
              >
                {weapon && weaponRef ? (
                  <span className="flex min-w-0 items-center gap-[0.8rem]">
                    <Icon
                      type={weapon.type}
                      rarity={weapon.rarity}
                      color={weapon.color}
                      alt=""
                      className="mr-0"
                    />
                    <span className="flex min-w-0 flex-col gap-[0.2rem]">
                      <span className="truncate text-main text-white">
                        {game.name("weapon", weapon.name)}
                      </span>
                      <span className="flex flex-wrap gap-x-[1.2rem] text-fine text-parchment">
                        <span>
                          {text.attack}{" "}
                          <span className="text-white">{formatNumber(weapon.attack ?? 0)}</span>
                        </span>
                        {weapon.elements?.map((e) => (
                          <span key={e.name} className="text-element">
                            {t.common.elements[e.name] ?? e.name} {formatNumber(e.attack)}
                          </span>
                        ))}
                        {weapon.affinity && weapon.affinity !== "0%" && (
                          <span>
                            {text.affinity} <span className="text-white">{weapon.affinity}</span>
                          </span>
                        )}
                      </span>
                    </span>
                  </span>
                ) : loading ? (
                  <Loading>{t.common.loading}</Loading>
                ) : (
                  <span className="text-white">{text.pickWeapon}</span>
                )}
                <span className="flex-none text-white/50" aria-hidden="true">
                  {text.changeWeapon}
                </span>
              </button>
              <div aria-hidden="true" className="h-px bg-white/15" />
              <button
                type="button"
                className={cn(pressable, menuRow, "min-h-[4.8rem]")}
                aria-label={text.buffsLabel}
                aria-haspopup="dialog"
                onClick={() => setSheet("buffs")}
              >
                <span className="flex min-w-0 flex-col gap-[0.4rem]">
                  <span className="text-fine text-parchment">{text.buffs}</span>
                  <span className="whitespace-normal text-white">
                    {on.length ? on.join(", ") : text.noBuffs}
                  </span>
                </span>
                <span className="flex-none text-white/50" aria-hidden="true">
                  {text.changeWeapon}
                </span>
              </button>
              {weapon && on.length > 0 && (
                <p className="m-0 px-[0.4rem] pb-[0.4rem] text-fine text-parchment">
                  {text.trueAttack}{" "}
                  <span className="text-white">
                    {formatNumber(weapon.raw_attack ?? 0)} →{" "}
                    {formatNumber(
                      buffedAttack(weapon.raw_attack ?? 0, buffs, {
                        // As the table: the Long Sword's spirit glow, when set.
                        spiritGlow: settings.glow && weaponRef?.type === "long-sword",
                      }),
                    )}
                  </span>
                </p>
              )}
              <div aria-hidden="true" className="h-px bg-white/15" />
              <button
                type="button"
                className={cn(pressable, menuRow, "min-h-[4.8rem]")}
                aria-label={text.questLabel}
                aria-haspopup="dialog"
                onClick={() => setSheet("quest")}
              >
                <span className="flex min-w-0 flex-col gap-[0.4rem]">
                  <span className="text-fine text-parchment">{text.quest}</span>
                  <span className="whitespace-normal text-white">
                    {quest ? game.quest(quest.id, "title", quest.title) : text.noQuest}
                  </span>
                  {questStats && (
                    <span className="text-fine text-parchment">
                      {text.defense(
                        game.name("monster", questStats.monster.name),
                        formatNumber(questStats.defense),
                      )}
                    </span>
                  )}
                </span>
                <span className="flex-none text-white/50" aria-hidden="true">
                  {text.changeWeapon}
                </span>
              </button>
              {target && (
                <>
                  <div aria-hidden="true" className="h-px bg-white/15" />
                  <button
                    type="button"
                    className={cn(pressable, menuRow, "min-h-[4.8rem]")}
                    aria-label={text.targetLabel}
                    aria-haspopup="dialog"
                    onClick={() => setSheet("target")}
                  >
                    <TargetSummary target={target} hitzone={hitzone} />
                    <span className="flex-none text-white/50" aria-hidden="true">
                      {text.changeWeapon}
                    </span>
                  </button>
                </>
              )}
            </div>
            {weapon && weaponRef && !shots && (
              <MotionSettings
                type={weaponRef.type}
                weapon={weapon}
                buffs={buffs}
                settings={settings}
              />
            )}
          </Card>
        </CardBox>

        <CardBox className="flex-none min-[900px]:h-full">
          <Card scroll className="text-small" bodyClassName="card-py-7 gap-[1.3rem]">
            {!loaded || loading ? (
              <Loading>{t.common.loading}</Loading>
            ) : weapon && weaponRef ? (
              <>
                {target && <HitzoneBar target={target} hitzone={hitzone} />}
                {shots ? (
                  <ShotDamage weapon={weapon} buffs={buffs} hitzone={hitzone} defense={defense} />
                ) : (
                  <MotionDamage
                    type={weaponRef.type}
                    weapon={weapon}
                    buffs={buffs}
                    settings={settings}
                    hitzone={hitzone}
                    defense={defense}
                  />
                )}
              </>
            ) : (
              <p className="m-0 text-white/60">{text.empty}</p>
            )}
          </Card>
        </CardBox>
      </div>

      <Sheet open={sheet === "weapon"} onClose={closeSheet} title={text.weapon} tall>
        <WeaponPicker
          current={weaponRef}
          onPick={(w) => {
            setWeaponRef(w);
            setSheet(null);
          }}
        />
      </Sheet>

      <Sheet open={sheet === "target" && !!target} onClose={closeSheet} title={text.target}>
        {target && (
          <TargetPicker
            target={target}
            hitzone={hitzone}
            only={quest ? questMonsters(quest) : undefined}
            onPicked={closeSheet}
          />
        )}
      </Sheet>

      <Sheet
        open={sheet === "quest"}
        onClose={closeSheet}
        title={text.quest}
        tall
        footer={
          questId !== null && (
            <button
              type="button"
              className={cn(textButton, "text-small")}
              onClick={() => {
                setQuestId(null);
                setSheet(null);
              }}
            >
              {text.clear}
            </button>
          )
        }
      >
        <QuestPicker current={quest} onPick={pickQuest} />
      </Sheet>

      <Sheet
        open={sheet === "buffs"}
        onClose={closeSheet}
        title={text.buffs}
        footer={
          on.length > 0 && (
            <button
              type="button"
              className={cn(textButton, "text-small")}
              onClick={() => setBuffs(NO_BUFFS)}
            >
              {text.clear}
            </button>
          )
        }
      >
        <BuffOptions buffs={buffs} update={update} />
      </Sheet>
    </>
  );
}
