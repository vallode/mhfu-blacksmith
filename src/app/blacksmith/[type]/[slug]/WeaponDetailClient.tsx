"use client";

import WeaponNav from "@/components/WeaponNav";
import WeaponTreeRow from "@/components/WeaponTreeRow";
import TreeScroll from "@/components/TreeScroll";
import SharpnessBar from "@/components/SharpnessBar";
import MaterialRow from "@/components/MaterialRow";
import Card from "@/components/Card";
import Icon from "@/components/Icon";
import cardStyles from "@/styles/weapon-card.module.scss";
import sharpStyles from "@/styles/sharpness.module.scss";
import type { WeaponType } from "@/lib/constants";
import { useWeapon, useMelodies } from "@/lib/client-data";

interface Props {
  type: WeaponType;
  slug: string;
}

function affinityClass(affinity: string | undefined): string {
  if (!affinity) return "";
  if (affinity.startsWith("-")) return "negative";
  if (!affinity.startsWith("0")) return "positive";
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

  if (loading) {
    return (
      <>
        <WeaponNav activeType={type} />
        <hr className="border" />
        <p style={{ padding: "2rem" }}>Loading…</p>
      </>
    );
  }
  if (!weapon) {
    return (
      <>
        <WeaponNav activeType={type} />
        <hr className="border" />
        <p style={{ padding: "2rem" }}>Not found.</p>
      </>
    );
  }

  const basePath = `/blacksmith/${type}/`;

  return (
    <>
      <WeaponNav activeType={type} />
      <hr className="border" />

      <div className="weapon-details-page">
        {/* Weapon tree sidebar */}
        <Card variant="weapon-tree">
          <TreeScroll treeKey={`weapon-${type}`} activeSlug={slug}>
            {tree?.map((node) => (
              <ul key={node.slug}>
                <WeaponTreeRow
                  node={node}
                  sectionType={type}
                  basePath={basePath}
                  activeSlug={slug}
                />
              </ul>
            ))}
          </TreeScroll>
        </Card>

        {/* Detail panel */}
        <Card className={cardStyles["weapon-card"]}>
          {/* Header: icon + name + sharpness */}
          <div className={cardStyles["weapon-card__header"]}>
            <Icon
              type={weapon.type}
              size="large"
              rarity={weapon.rarity}
              color={weapon.color}
              alt={weapon.name}
            />

            <p id="weapon_name">{weapon.name}</p>

            {(weapon.sharpness || weapon.sharpness_plus) && (
              <div className={sharpStyles["sharpness-container"]}>
                {weapon.sharpness && (
                  <SharpnessBar values={weapon.sharpness} />
                )}
                {weapon.sharpness_plus && (
                  <SharpnessBar values={weapon.sharpness_plus} plus />
                )}
              </div>
            )}
          </div>

          {/* Stats + requirements */}
          <div className={cardStyles["weapon-card__details"]}>
            <div className="stats">
              {weapon.attack && (
                <div>
                  <h3>Attack:</h3>
                  <p>
                    <span>{weapon.attack}</span>
                    {weapon.raw_attack && (
                      <span className="raw">[ {weapon.raw_attack} ]</span>
                    )}
                    {weapon.shelling && (
                      <span>[{weapon.shelling.type} Type]</span>
                    )}
                  </p>
                </div>
              )}

              {weapon.max_attack && (
                <div>
                  <h3>Max attack:</h3>
                  <p><span>{weapon.max_attack}</span></p>
                </div>
              )}

              {weapon.recoil && (
                <div>
                  <h3>Recoil:</h3>
                  <p><span>{weapon.recoil}</span></p>
                </div>
              )}

              {weapon.reload && (
                <div>
                  <h3>Reload:</h3>
                  <p><span>{weapon.reload}</span></p>
                </div>
              )}

              {weapon.affinity && (
                <div>
                  <h3>Affinity:</h3>
                  <p>
                    <span className={affinityClass(weapon.affinity)}>
                      {weapon.affinity}
                    </span>
                  </p>
                </div>
              )}

              <div>
                <h3>Slots:</h3>
                <p>
                  <span id="weaponSlots">
                    {Array.from({ length: 3 }, (_, i) =>
                      i < (weapon.slots ?? 0) ? "O" : "-"
                    ).join("")}
                  </span>
                </p>
              </div>

              {weapon.shelling && (
                <p>
                  <span className="positive">
                    Shelling Lv{weapon.shelling.level}
                  </span>
                </p>
              )}

              {weapon.notes && (
                <div className="notes">
                  [Note:
                  {weapon.notes.map((note, i) => (
                    <Icon key={i} type="note" color={`note-${note}`} alt={note} />
                  ))}
                  ]
                </div>
              )}

              {weapon.elements?.map((el, i) => (
                <p key={i} className="element">
                  {el.name} Attrib: {el.attack}
                  {typeof el.attack === "number" && (
                    <span className="raw"> [ {el.attack / 10} ]</span>
                  )}
                </p>
              ))}

              {weapon.skills?.map((skill, i) => (
                <p key={i} className="element">{skill}</p>
              ))}

              {weapon.bonus && (
                <p className="element">Defense {weapon.bonus}</p>
              )}
            </div>

            <hr />

            {/* Requirements section */}
            <div className="requirements">
              <div className="page active">
                {weapon.improve_mats && (
                  <div className="improve_mats">
                    <p>
                      <span>Improve cost: </span>
                      {weapon.improve_cost}z
                    </p>
                    {weapon.improve_mats.map((m, i) => (
                      <MaterialRow key={i} material={m} />
                    ))}
                  </div>
                )}

                {weapon.create_mats && (
                  <div className="create_mats">
                    <p>
                      <span>Create cost: </span>
                      {weapon.create_cost}z
                    </p>
                    {weapon.create_mats.map((m, i) => (
                      <MaterialRow key={i} material={m} />
                    ))}
                  </div>
                )}
              </div>

              {weapon.alternative_create_mats && (
                <div className="page">
                  <div className="create_mats">
                    <p>
                      <span>Create cost: </span>
                      {weapon.create_cost}z
                    </p>
                    {weapon.alternative_create_mats.map((m, i) => (
                      <MaterialRow key={i} material={m} />
                    ))}
                  </div>
                </div>
              )}

              {weapon.shots && (
                <div className="page">
                  <div className="shots">
                    <p><span>[Charge Attack]</span></p>
                    {weapon.shots.map((shot, i) => (
                      <p key={i} className={i === weapon.shots!.length - 1 ? "green" : ""}>
                        <span className="orange">
                          <span style={{ visibility: i === 0 ? "visible" : "hidden" }}>
                            Lvl
                          </span>{" "}
                          {i + 1}:
                        </span>{" "}
                        {shot.name}Lv{shot.level}
                      </p>
                    ))}
                  </div>
                </div>
              )}

              {weapon.ammo && (
                <div className="page">
                  <table className="min">
                    <thead>
                      <tr>
                        <th>Cap.:</th><th>LV</th><th>1</th><th>2</th><th>3</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {weapon.ammo.map((ammo, i) => (
                        <tr key={i} className={ammo.capacity.join("") === "000" ? "gray" : ""}>
                          <td>{ammo.name}</td>
                          <td>:</td>
                          {ammo.capacity.map((cap, j) => (
                            <td key={j} className={cap === 0 ? "gray" : ""}>
                              {cap}{j < ammo.capacity.length - 1 ? "/" : ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {weapon.status_ammo && (
                    <table className="min">
                      <thead>
                        <tr>
                          <th></th><th>LV</th><th>1</th><th>2</th><th></th>
                        </tr>
                      </thead>
                      <tbody>
                        {weapon.status_ammo.map((ammo, i) => (
                          <tr key={i} className={ammo.capacity.join("") === "000" ? "gray" : ""}>
                            <td>{ammo.name}</td>
                            <td>:</td>
                            {ammo.capacity.map((cap, j) => (
                              <td key={j} className={cap === 0 ? "gray" : ""}>
                                {cap}{j < ammo.capacity.length - 1 ? "/" : ""}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {weapon.element_ammo && (
                <div className="page">
                  <table className="min">
                    <thead>
                      <tr><th>Cap.:</th><th></th><th></th></tr>
                    </thead>
                    <tbody>
                      {weapon.element_ammo.map((ammo, i) => (
                        <tr key={i} className={ammo.capacity.join("") === "0" ? "gray" : ""}>
                          <td>{ammo.name}</td>
                          <td>:</td>
                          {ammo.capacity.map((cap, j) => (
                            <td key={j} className={cap === 0 ? "gray" : ""}>
                              {cap}{j < ammo.capacity.length - 1 ? "/" : ""}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {weapon.misc_ammo && (
                    <table className="min">
                      <thead>
                        <tr><th></th><th></th><th></th></tr>
                      </thead>
                      <tbody>
                        {weapon.misc_ammo.map((ammo, i) => (
                          <tr key={i} className={ammo.capacity.join("") === "0" ? "gray" : ""}>
                            <td>{ammo.name}</td>
                            <td>:</td>
                            {ammo.capacity.map((cap, j) => (
                              <td key={j} className={cap === 0 ? "gray" : ""}>
                                {cap}{j < ammo.capacity.length - 1 ? "/" : ""}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}

              {weapon.coatings && (
                <div className="page">
                  <div className="coatings">
                    <p><span>[Usable Coating]</span></p>
                    {COATINGS.map((coating) => {
                      const key = coating.toLowerCase().replace(" coating", "").trim();
                      const usable = weapon.coatings!.some((c) =>
                        c.toLowerCase().includes(key)
                      );
                      return (
                        <p key={coating} className={usable ? "" : "gray"}>
                          {coating}
                        </p>
                      );
                    })}
                  </div>
                </div>
              )}

              {melodies && (
                <div className="page">
                  <table className="min">
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
                          <td className="notes">
                            {melody.combo.map((note, j) => (
                              <Icon key={j} type="note" color={`note-${note}`} alt={note} />
                            ))}
                          </td>
                          <td>{melody.effect}</td>
                          <td>{melody.duration}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </Card>
      </div>
    </>
  );
}
