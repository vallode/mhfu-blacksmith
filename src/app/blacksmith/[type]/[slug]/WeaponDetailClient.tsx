"use client";

import { useState } from "react";
import WeaponNav from "@/components/WeaponNav";
import WeaponTreePanel from "@/components/WeaponTreePanel";
import SharpnessBar from "@/components/SharpnessBar";
import Card from "@/components/Card";
import Icon from "@/components/Icon";
import {
  DetailBody,
  DetailCard,
  DetailHeader,
  DetailName,
  DetailRule,
  MaterialList,
  Requirements,
  RequirementTabs,
  RequirementsPage,
  Slots,
  Stat,
  StatList,
  StatValue,
} from "@/components/DetailPanel";
import { cn } from "@/lib/cn";
import {
  melodyDuration,
  melodyDurationBelow,
  melodyNote,
  melodyTable,
  statTable,
} from "@/styles/tables";
import type { WeaponType } from "@/lib/constants";
import { useWeapon, useMelodies } from "@/lib/client-data";
import BorderRule from "@/components/BorderRule";
import ModelViewer from "@/components/ModelViewer";
import ModelPopover, { ModelButton } from "@/components/ModelPopover";
import { useWeaponModel } from "@/lib/models";
import { usePreferences } from "@/context/PreferencesContext";
import { useGameText, useT } from "@/context/LanguageContext";
import Loading from "@/components/Loading";

interface Props {
  type: WeaponType;
  slug: string;
}

function affinityClass(affinity: string | undefined): string {
  if (!affinity) return "";
  if (affinity.startsWith("-")) return "text-negative";
  if (!affinity.startsWith("0")) return "text-positive";
  return "";
}

/** Bow coatings in the game's order (English, matched against the data). */
const COATINGS = [
  "Power Coating",
  "Poison Coating",
  "CloseRngCoating",
  "ParalysisCoating",
  "Paint Coating",
  "Sleep Coating",
];

/** "3 mins", "1 min 30 s", "30 s" as minutes and seconds; null for anything else. */
function parseDuration(text: string): [number, number] | null {
  const match = /^(?:(\d+) mins?)?\s*(?:(\d+) s)?$/.exec(text.trim());
  if (!match || (!match[1] && !match[2])) return null;
  return [Number(match[1] ?? 0), Number(match[2] ?? 0)];
}

export default function WeaponDetailClient({ type, slug }: Props) {
  const { item: weapon, tree, loading } = useWeapon(type, slug);
  const melodies = useMelodies(weapon?.notes);
  const modelUrl = useWeaponModel(type, weapon?.name);
  const { showRawValues } = usePreferences().prefs;
  // Open state is tied to the model, so navigating to another weapon closes it.
  const [openModel, setOpenModel] = useState<string | null>(null);
  const modelOpen = modelUrl !== null && openModel === modelUrl;
  const t = useT();
  const game = useGameText();
  const tw = t.equipment.weapon;
  const td = t.equipment.detail;
  /** A value from one of the data's closed sets, translated when the dictionary has it. */
  const lookup = (table: Record<string, string>, value: string) => table[value] ?? value;
  const duration = (text: string) => {
    const parsed = parseDuration(text);
    return parsed ? tw.duration(...parsed) : text;
  };

  if (loading || !weapon) {
    // Keep the split layout (and the tree card frame) in place while the data
    // bundle loads so the sidebar doesn't flash in once it resolves.
    return (
      <>
        <WeaponNav activeType={type} />
        <BorderRule />
        <div className="split-page">
          <WeaponTreePanel type={type} tree={null} activeSlug={slug} />
          <Card>{loading ? <Loading>{t.common.loading}</Loading> : <p>{td.notFound}</p>}</Card>
        </div>
      </>
    );
  }

  const name = game.name("weapon", weapon.name);

  return (
    <>
      <WeaponNav activeType={type} />
      <BorderRule />

      <div className="split-page">
        {/* Weapon tree sidebar */}
        <WeaponTreePanel type={type} tree={tree} activeSlug={slug} />

        {/* Detail panel */}
        <DetailCard>
          {/* Header: icon + name + sharpness */}
          <DetailHeader>
            <Icon
              type={weapon.type}
              size="large"
              rarity={weapon.rarity}
              color={weapon.color}
              alt={name}
            />

            <DetailName id="weapon_name">{name}</DetailName>

            {modelUrl && (
              <ModelButton
                open={modelOpen}
                onClick={() => setOpenModel(modelOpen ? null : modelUrl)}
                className="ml-[0.4rem]"
              />
            )}

            {(weapon.sharpness || weapon.sharpness_plus) && (
              <div className="relative ml-auto flex flex-col gap-[0.5rem] mobile:mt-[1rem] mobile:mr-auto mobile:ml-0">
                {weapon.sharpness && <SharpnessBar values={weapon.sharpness} />}
                {weapon.sharpness_plus && <SharpnessBar values={weapon.sharpness_plus} plus />}
              </div>
            )}
          </DetailHeader>

          {/* Stats + requirements */}
          <DetailBody>
            <StatList>
              {weapon.attack && (
                <Stat label={tw.attack}>
                  <StatValue>{weapon.attack}</StatValue>
                  {showRawValues && weapon.raw_attack && (
                    <StatValue className="opacity-20">[ {weapon.raw_attack} ]</StatValue>
                  )}
                  {weapon.shelling && (
                    <StatValue>
                      {tw.shellingType(lookup(tw.shellingTypes, weapon.shelling.type))}
                    </StatValue>
                  )}
                </Stat>
              )}

              {weapon.max_attack && (
                <Stat label={tw.maxAttack}>
                  <StatValue>{weapon.max_attack}</StatValue>
                </Stat>
              )}

              {weapon.recoil && (
                <Stat label={tw.recoil}>
                  <StatValue>{lookup(tw.recoilValues, weapon.recoil)}</StatValue>
                </Stat>
              )}

              {weapon.reload && (
                <Stat label={tw.reload}>
                  <StatValue>{lookup(tw.reloadValues, weapon.reload)}</StatValue>
                </Stat>
              )}

              {weapon.affinity && (
                <Stat label={tw.affinity}>
                  <StatValue className={affinityClass(weapon.affinity)}>
                    {weapon.affinity}
                  </StatValue>
                </Stat>
              )}

              <Stat label={td.slots}>
                <Slots count={weapon.slots} />
              </Stat>

              {weapon.shelling && (
                <p className="inline-block">
                  <StatValue className="text-positive">
                    {tw.shellingLevel(weapon.shelling.level)}
                  </StatValue>
                </p>
              )}

              {weapon.notes && (
                <div className="text-white">
                  {tw.notesOpen}
                  {weapon.notes.map((note, i) => (
                    <Icon key={i} type="note" color={`note-${note}`} alt={lookup(tw.notes, note)} />
                  ))}
                  {tw.notesClose}
                </div>
              )}

              {weapon.elements?.map((el, i) => (
                <p key={i} className="inline-block whitespace-normal text-element">
                  {tw.elementAttrib(t.common.elements[el.name] ?? el.name)}{" "}
                  <span className="whitespace-nowrap">{el.attack}</span>
                  {showRawValues && typeof el.attack === "number" && (
                    <>
                      {" "}
                      <StatValue className="whitespace-nowrap opacity-20">
                        [ {el.attack / 10} ]
                      </StatValue>
                    </>
                  )}
                </p>
              ))}

              {weapon.skills?.map((skill, i) => (
                <p key={i} className="inline-block whitespace-normal text-element">
                  {game.name("skill", skill)}
                </p>
              ))}

              {weapon.bonus && (
                <p className="inline-block text-element">{tw.defenseBonus(String(weapon.bonus))}</p>
              )}
            </StatList>

            <DetailRule />

            {/* Requirements: one tab per page (materials, ammo, melodies, …) */}
            <Requirements>
              <RequirementTabs
                key={slug}
                label={tw.requirementsLabel(name)}
                tabs={[
                  {
                    id: "materials",
                    label: tw.tabs.materials,
                    content: (
                      <RequirementsPage stacked>
                        {weapon.improve_mats && (
                          <MaterialList
                            label={td.improveCost}
                            cost={weapon.improve_cost}
                            materials={weapon.improve_mats}
                          />
                        )}

                        {weapon.create_mats && (
                          <MaterialList
                            label={td.createCost}
                            cost={weapon.create_cost}
                            materials={weapon.create_mats}
                          />
                        )}
                      </RequirementsPage>
                    ),
                  },
                  weapon.alternative_create_mats && {
                    id: "alt-recipe",
                    label: td.altRecipe,
                    content: (
                      <RequirementsPage>
                        <MaterialList
                          label={td.createCost}
                          cost={weapon.create_cost}
                          materials={weapon.alternative_create_mats}
                        />
                      </RequirementsPage>
                    ),
                  },
                  weapon.shots && {
                    id: "charge",
                    label: tw.tabs.charge,
                    content: (
                      <RequirementsPage>
                        <div className="flex flex-1 flex-col gap-[13px]">
                          <p>
                            <span className="text-stat">{tw.chargeAttack}</span>
                          </p>
                          {weapon.shots.map((shot, i) => {
                            // The last (strongest) level is highlighted green.
                            const last = i === weapon.shots!.length - 1;
                            return (
                              <p key={i} className={last ? "text-positive" : undefined}>
                                <span className={last ? "text-positive" : "text-warm"}>
                                  <span
                                    className="text-warm"
                                    style={{ visibility: i === 0 ? "visible" : "hidden" }}
                                  >
                                    {tw.chargeLevel}
                                  </span>{" "}
                                  {i + 1}:
                                </span>{" "}
                                {tw.chargeShot(lookup(tw.shotTypes, shot.name), shot.level)}
                              </p>
                            );
                          })}
                        </div>
                      </RequirementsPage>
                    ),
                  },
                  weapon.ammo && {
                    id: "ammo",
                    label: tw.tabs.ammo,
                    content: (
                      <RequirementsPage>
                        <table className={statTable}>
                          <thead>
                            <tr>
                              <th>{tw.capacity}</th>
                              <th>{tw.ammoLevel}</th>
                              <th>1</th>
                              <th>2</th>
                              <th>3</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {weapon.ammo.map((ammo, i) => (
                              <tr
                                key={i}
                                className={
                                  ammo.capacity.join("") === "000" ? "text-unavailable" : ""
                                }
                              >
                                <td>{lookup(tw.ammo, ammo.name)}</td>
                                <td>:</td>
                                {ammo.capacity.map((cap, j) => (
                                  <td key={j} className={cap === 0 ? "text-unavailable" : ""}>
                                    {cap}
                                    {j < ammo.capacity.length - 1 ? "/" : ""}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        {weapon.status_ammo && (
                          <table className={statTable}>
                            <thead>
                              <tr>
                                <th></th>
                                <th>{tw.ammoLevel}</th>
                                <th>1</th>
                                <th>2</th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {weapon.status_ammo.map((ammo, i) => (
                                <tr
                                  key={i}
                                  className={
                                    ammo.capacity.join("") === "000" ? "text-unavailable" : ""
                                  }
                                >
                                  <td>{lookup(tw.ammo, ammo.name)}</td>
                                  <td>:</td>
                                  {ammo.capacity.map((cap, j) => (
                                    <td key={j} className={cap === 0 ? "text-unavailable" : ""}>
                                      {cap}
                                      {j < ammo.capacity.length - 1 ? "/" : ""}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </RequirementsPage>
                    ),
                  },
                  weapon.element_ammo && {
                    id: "special-ammo",
                    label: tw.tabs.specialAmmo,
                    content: (
                      <RequirementsPage>
                        <table className={statTable}>
                          <thead>
                            <tr>
                              <th>{tw.capacity}</th>
                              <th></th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {weapon.element_ammo.map((ammo, i) => (
                              <tr
                                key={i}
                                className={ammo.capacity.join("") === "0" ? "text-unavailable" : ""}
                              >
                                <td>{lookup(tw.ammo, ammo.name)}</td>
                                <td>:</td>
                                {ammo.capacity.map((cap, j) => (
                                  <td key={j} className={cap === 0 ? "text-unavailable" : ""}>
                                    {cap}
                                    {j < ammo.capacity.length - 1 ? "/" : ""}
                                  </td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>

                        {weapon.misc_ammo && (
                          <table className={statTable}>
                            <thead>
                              <tr>
                                <th></th>
                                <th></th>
                                <th></th>
                              </tr>
                            </thead>
                            <tbody>
                              {weapon.misc_ammo.map((ammo, i) => (
                                <tr
                                  key={i}
                                  className={
                                    ammo.capacity.join("") === "0" ? "text-unavailable" : ""
                                  }
                                >
                                  <td>{lookup(tw.ammo, ammo.name)}</td>
                                  <td>:</td>
                                  {ammo.capacity.map((cap, j) => (
                                    <td key={j} className={cap === 0 ? "text-unavailable" : ""}>
                                      {cap}
                                      {j < ammo.capacity.length - 1 ? "/" : ""}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </RequirementsPage>
                    ),
                  },
                  weapon.coatings && {
                    id: "coatings",
                    label: tw.tabs.coatings,
                    content: (
                      <RequirementsPage>
                        <div className="flex flex-1 flex-row flex-wrap content-start gap-[13px]">
                          <p className="w-full">
                            <span className="text-stat">{tw.usableCoating}</span>
                          </p>
                          {COATINGS.map((coating) => {
                            const key = coating.toLowerCase().replace(" coating", "").trim();
                            const usable = weapon.coatings!.some((c) =>
                              c.toLowerCase().includes(key),
                            );
                            return (
                              <p
                                key={coating}
                                className={cn(
                                  "w-[calc(50%-13px)] mobile:w-full",
                                  !usable && "text-unavailable",
                                )}
                              >
                                {lookup(tw.coatings, coating)}
                              </p>
                            );
                          })}
                        </div>
                      </RequirementsPage>
                    ),
                  },
                  melodies && {
                    id: "melodies",
                    label: tw.tabs.melodies,
                    content: (
                      <RequirementsPage>
                        <table className={melodyTable}>
                          <thead>
                            <tr>
                              <th>{tw.melodyCombo}</th>
                              <th>{tw.melodyEffect}</th>
                              <th className={melodyDuration}>{tw.melodyDuration}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {melodies.map((melody, i) => (
                              <tr key={i}>
                                <td>
                                  <span className="flex">
                                    {melody.combo.map((note, j) => (
                                      <Icon
                                        key={j}
                                        type="note"
                                        color={`note-${note}`}
                                        alt={lookup(tw.notes, note)}
                                        className={melodyNote}
                                      />
                                    ))}
                                  </span>
                                </td>
                                <td>
                                  {melody.effect}
                                  {melody.duration && (
                                    <span className={melodyDurationBelow}>
                                      {duration(melody.duration)}
                                    </span>
                                  )}
                                </td>
                                <td className={melodyDuration}>
                                  {melody.duration && duration(melody.duration)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </RequirementsPage>
                    ),
                  },
                ]}
              />
            </Requirements>
          </DetailBody>
        </DetailCard>
        {modelOpen && (
          <ModelPopover title={name} onClose={() => setOpenModel(null)}>
            <ModelViewer src={modelUrl} label={name} pair={type === "dual-blades"} />
          </ModelPopover>
        )}
      </div>
    </>
  );
}
