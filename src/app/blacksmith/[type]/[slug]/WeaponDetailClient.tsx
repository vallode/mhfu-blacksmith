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
import { melodyNote, melodyTable, statTable } from "@/styles/tables";
import type { WeaponType } from "@/lib/constants";
import { useWeapon, useMelodies } from "@/lib/client-data";
import BorderRule from "@/components/BorderRule";
import ModelViewer from "@/components/ModelViewer";
import ModelPopover, { ModelButton } from "@/components/ModelPopover";
import { useWeaponModel } from "@/lib/models";
import { usePreferences } from "@/context/PreferencesContext";
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

const COATINGS = [
  "Power Coating",
  "Poison Coating",
  "CloseRngCoating",
  "ParalysisCoating",
  "Paint Coating",
  "Sleep Coating",
];

export default function WeaponDetailClient({ type, slug }: Props) {
  const { item: weapon, tree, loading } = useWeapon(type, slug);
  const melodies = useMelodies(weapon?.notes);
  const modelUrl = useWeaponModel(type, weapon?.name);
  const { showRawValues } = usePreferences().prefs;
  // Open state is tied to the model, so navigating to another weapon closes it.
  const [openModel, setOpenModel] = useState<string | null>(null);
  const modelOpen = modelUrl !== null && openModel === modelUrl;

  if (loading || !weapon) {
    // Keep the split layout (and the tree card frame) in place while the data
    // bundle loads so the sidebar doesn't flash in once it resolves.
    return (
      <>
        <WeaponNav activeType={type} />
        <BorderRule />
        <div className="split-page">
          <WeaponTreePanel type={type} tree={null} activeSlug={slug} />
          <Card>{loading ? <Loading>Loading…</Loading> : <p>Not found.</p>}</Card>
        </div>
      </>
    );
  }

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
              alt={weapon.name}
            />

            <p id="weapon_name">{weapon.name}</p>

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
                <Stat label="Attack:">
                  <StatValue>{weapon.attack}</StatValue>
                  {showRawValues && weapon.raw_attack && (
                    <StatValue className="opacity-20">[ {weapon.raw_attack} ]</StatValue>
                  )}
                  {weapon.shelling && <StatValue>[{weapon.shelling.type} Type]</StatValue>}
                </Stat>
              )}

              {weapon.max_attack && (
                <Stat label="Max attack:">
                  <StatValue>{weapon.max_attack}</StatValue>
                </Stat>
              )}

              {weapon.recoil && (
                <Stat label="Recoil:">
                  <StatValue>{weapon.recoil}</StatValue>
                </Stat>
              )}

              {weapon.reload && (
                <Stat label="Reload:">
                  <StatValue>{weapon.reload}</StatValue>
                </Stat>
              )}

              {weapon.affinity && (
                <Stat label="Affinity:">
                  <StatValue className={affinityClass(weapon.affinity)}>
                    {weapon.affinity}
                  </StatValue>
                </Stat>
              )}

              <Stat label="Slots:">
                <Slots count={weapon.slots} />
              </Stat>

              {weapon.shelling && (
                <p className="inline-block">
                  <StatValue className="text-positive">
                    Shelling Lv{weapon.shelling.level}
                  </StatValue>
                </p>
              )}

              {weapon.notes && (
                <div className="text-white">
                  [Note:
                  {weapon.notes.map((note, i) => (
                    <Icon key={i} type="note" color={`note-${note}`} alt={note} />
                  ))}
                  ]
                </div>
              )}

              {weapon.elements?.map((el, i) => (
                <p key={i} className="inline-block text-element">
                  {el.name} Attrib: {el.attack}
                  {showRawValues && typeof el.attack === "number" && (
                    <StatValue className="opacity-20"> [ {el.attack / 10} ]</StatValue>
                  )}
                </p>
              ))}

              {weapon.skills?.map((skill, i) => (
                <p key={i} className="inline-block text-element">
                  {skill}
                </p>
              ))}

              {weapon.bonus && <p className="inline-block text-element">Defense {weapon.bonus}</p>}
            </StatList>

            <DetailRule />

            {/* Requirements: one tab per page (materials, ammo, melodies, …) */}
            <Requirements>
              <RequirementTabs
                key={slug}
                label={`${weapon.name} requirements`}
                tabs={[
                  {
                    id: "materials",
                    label: "Materials",
                    content: (
                      <RequirementsPage stacked>
                        {weapon.improve_mats && (
                          <MaterialList
                            label="Improve cost"
                            cost={weapon.improve_cost}
                            materials={weapon.improve_mats}
                          />
                        )}

                        {weapon.create_mats && (
                          <MaterialList
                            label="Create cost"
                            cost={weapon.create_cost}
                            materials={weapon.create_mats}
                          />
                        )}
                      </RequirementsPage>
                    ),
                  },
                  weapon.alternative_create_mats && {
                    id: "alt-recipe",
                    label: "Alt. Recipe",
                    content: (
                      <RequirementsPage>
                        <MaterialList
                          label="Create cost"
                          cost={weapon.create_cost}
                          materials={weapon.alternative_create_mats}
                        />
                      </RequirementsPage>
                    ),
                  },
                  weapon.shots && {
                    id: "charge",
                    label: "Charge",
                    content: (
                      <RequirementsPage>
                        <div className="flex flex-1 flex-col gap-[13px]">
                          <p>
                            <span className="text-stat">[Charge Attack]</span>
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
                                    Lvl
                                  </span>{" "}
                                  {i + 1}:
                                </span>{" "}
                                {shot.name}Lv{shot.level}
                              </p>
                            );
                          })}
                        </div>
                      </RequirementsPage>
                    ),
                  },
                  weapon.ammo && {
                    id: "ammo",
                    label: "Ammo",
                    content: (
                      <RequirementsPage>
                        <table className={statTable}>
                          <thead>
                            <tr>
                              <th>Cap.:</th>
                              <th>LV</th>
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
                                <td>{ammo.name}</td>
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
                                <th>LV</th>
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
                                  <td>{ammo.name}</td>
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
                    label: "Special Ammo",
                    content: (
                      <RequirementsPage>
                        <table className={statTable}>
                          <thead>
                            <tr>
                              <th>Cap.:</th>
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
                                <td>{ammo.name}</td>
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
                                  <td>{ammo.name}</td>
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
                    label: "Coatings",
                    content: (
                      <RequirementsPage>
                        <div className="flex flex-1 flex-row flex-wrap content-start gap-[13px]">
                          <p className="w-full">
                            <span className="text-stat">[Usable Coating]</span>
                          </p>
                          {COATINGS.map((coating) => {
                            const key = coating.toLowerCase().replace(" coating", "").trim();
                            const usable = weapon.coatings!.some((c) =>
                              c.toLowerCase().includes(key),
                            );
                            return (
                              <p
                                key={coating}
                                className={cn("w-[calc(50%-13px)]", !usable && "text-unavailable")}
                              >
                                {coating}
                              </p>
                            );
                          })}
                        </div>
                      </RequirementsPage>
                    ),
                  },
                  melodies && {
                    id: "melodies",
                    label: "Melodies",
                    content: (
                      <RequirementsPage>
                        <table className={melodyTable}>
                          <thead>
                            <tr>
                              <th>Combo</th>
                              <th>Effect</th>
                              <th>Duration</th>
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
                                        alt={note}
                                        className={melodyNote}
                                      />
                                    ))}
                                  </span>
                                </td>
                                <td>{melody.effect}</td>
                                <td>{melody.duration}</td>
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
          <ModelPopover title={weapon.name} onClose={() => setOpenModel(null)}>
            <ModelViewer src={modelUrl} label={weapon.name} pair={type === "dual-blades"} />
          </ModelPopover>
        )}
      </div>
    </>
  );
}
