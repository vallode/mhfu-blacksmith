"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePreferences } from "@/context/PreferencesContext";
import SharpnessBar from "@/components/SharpnessBar";
import Icon from "@/components/Icon";
import styles from "@/styles/calculator.module.scss";

interface WeaponElement {
  name: string;
  attack: number;
}

interface WeaponEntry {
  name: string;
  slug: string;
  type: string;
  attack: number;
  raw_attack: number;
  affinity: string;
  slots: number;
  rarity: number;
  sharpness: number[];
  sharpness_plus: number[];
  elements: WeaponElement[];
  notes: string[] | null;
}

// Sharpness modifiers: [Red, Orange, Yellow, Green, Blue, White, Purple]
const SHARPNESS_LABELS = ["Red", "Orange", "Yellow", "Green", "Blue", "White", "Purple"] as const;
const SHARPNESS_MODS = [0.5, 0.75, 1.0, 1.05, 1.2, 1.32, 1.45] as const;

function getHighestSharpness(sharpness: number[]): number {
  for (let i = sharpness.length - 1; i >= 0; i--) {
    if (sharpness[i] > 0) return i;
  }
  return 0;
}

function formatAffinity(aff: string): string {
  return aff.startsWith("-") || aff.startsWith("0") ? aff : `+${aff}`;
}

const WEAPON_TYPES = [
  "great-sword",
  "long-sword",
  "sword-and-shield",
  "dual-blades",
  "hammer",
  "hunting-horn",
  "lance",
  "gunlance",
  "light-bowgun",
  "heavy-bowgun",
  "bow",
] as const;

function formatType(type: string): string {
  return type
    .split("-")
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export default function Calculator() {
  const { prefs } = usePreferences();
  const [allWeapons, setAllWeapons] = useState<WeaponEntry[]>([]);
  const [selectedType, setSelectedType] = useState<string>("great-sword");
  const [selectedSlug, setSelectedSlug] = useState<string>("");
  const [useSharpnessPlus, setUseSharpnessPlus] = useState(false);

  useEffect(() => {
    fetch("/weapon-data.json")
      .then((r) => r.json())
      .then((data: WeaponEntry[]) => {
        setAllWeapons(data);
      })
      .catch(console.error);
  }, []);

  const weaponsOfType = useMemo(
    () => allWeapons.filter((w) => w.type === selectedType),
    [allWeapons, selectedType]
  );

  const selectedWeapon = useMemo(
    () => weaponsOfType.find((w) => w.slug === selectedSlug) ?? null,
    [weaponsOfType, selectedSlug]
  );

  const handleTypeChange = useCallback((type: string) => {
    setSelectedType(type);
    setSelectedSlug("");
    setUseSharpnessPlus(false);
  }, []);

  const sharpness = selectedWeapon
    ? useSharpnessPlus && selectedWeapon.sharpness_plus.length > 0
      ? selectedWeapon.sharpness_plus
      : selectedWeapon.sharpness
    : null;

  const sharpnessIndex = sharpness ? getHighestSharpness(sharpness) : 0;
  const sharpnessMod = SHARPNESS_MODS[sharpnessIndex] ?? 1;
  const sharpnessLabel = SHARPNESS_LABELS[sharpnessIndex];

  const displayAttack = selectedWeapon
    ? prefs.showRawAttack
      ? selectedWeapon.raw_attack
      : selectedWeapon.attack
    : null;

  const affinityNum = selectedWeapon
    ? parseInt(selectedWeapon.affinity, 10) || 0
    : 0;

  const effectiveDamage =
    selectedWeapon && displayAttack != null
      ? Math.floor(
          (prefs.showRawAttack ? selectedWeapon.raw_attack : selectedWeapon.attack) *
            sharpnessMod *
            (1 + (affinityNum / 100) * 0.25)
        )
      : null;

  return (
    <div className={styles["calculator"]}>
      <div className={styles["calculator__controls"]}>
        <div className={styles["calculator__field"]}>
          <label className={styles["calculator__label"]}>Weapon Type</label>
          <div className={styles["calculator__type-list"]}>
            {WEAPON_TYPES.map((type) => (
              <button
                key={type}
                className={[
                  styles["calculator__type-btn"],
                  selectedType === type ? styles["calculator__type-btn--active"] : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={() => handleTypeChange(type)}
                title={formatType(type)}
              >
                <Icon type={type} size="large" nav alt={formatType(type)} />
              </button>
            ))}
          </div>
        </div>

        <div className={styles["calculator__field"]}>
          <label className={styles["calculator__label"]} htmlFor="weapon-select">
            Weapon
          </label>
          <select
            id="weapon-select"
            className={styles["calculator__select"]}
            value={selectedSlug}
            onChange={(e) => setSelectedSlug(e.target.value)}
          >
            <option value="">— Select a weapon —</option>
            {weaponsOfType.map((w) => (
              <option key={w.slug} value={w.slug}>
                {w.name}
              </option>
            ))}
          </select>
        </div>

        {selectedWeapon?.sharpness_plus && selectedWeapon.sharpness_plus.length > 0 && (
          <label className={styles["calculator__checkbox"]}>
            <input
              type="checkbox"
              checked={useSharpnessPlus}
              onChange={(e) => setUseSharpnessPlus(e.target.checked)}
            />
            Sharpness +1
          </label>
        )}
      </div>

      {selectedWeapon && (
        <div className={styles["calculator__result"]}>
          <h2 className={styles["calculator__weapon-name"]}>{selectedWeapon.name}</h2>

          <div className={styles["calculator__stats"]}>
            <div className={styles["calculator__stat"]}>
              <span className={styles["calculator__stat-label"]}>
                {prefs.showRawAttack ? "Raw Attack" : "Attack (inflated)"}
              </span>
              <span className={styles["calculator__stat-value"]}>{displayAttack}</span>
            </div>

            {selectedWeapon.affinity !== "0%" && (
              <div className={styles["calculator__stat"]}>
                <span className={styles["calculator__stat-label"]}>Affinity</span>
                <span
                  className={[
                    styles["calculator__stat-value"],
                    affinityNum < 0 ? styles["calculator__stat-value--negative"] : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                >
                  {formatAffinity(selectedWeapon.affinity)}
                </span>
              </div>
            )}

            <div className={styles["calculator__stat"]}>
              <span className={styles["calculator__stat-label"]}>Slots</span>
              <span className={styles["calculator__stat-value"]}>
                {"○".repeat(selectedWeapon.slots) || "—"}
              </span>
            </div>

            {selectedWeapon.elements.map((el) => (
              <div key={el.name} className={styles["calculator__stat"]}>
                <span className={styles["calculator__stat-label"]}>{el.name}</span>
                <span className={styles["calculator__stat-value"]}>{el.attack}</span>
              </div>
            ))}

            {selectedWeapon.notes && (
              <div className={styles["calculator__stat"]}>
                <span className={styles["calculator__stat-label"]}>Notes</span>
                <span className={styles["calculator__stat-value"]}>
                  {selectedWeapon.notes.join(" ")}
                </span>
              </div>
            )}
          </div>

          {sharpness && sharpness.length > 0 && (
            <div className={styles["calculator__sharpness"]}>
              <SharpnessBar values={sharpness} plus={useSharpnessPlus} />
              <span className={styles["calculator__sharpness-label"]}>
                {sharpnessLabel} × {sharpnessMod.toFixed(2)}
              </span>
            </div>
          )}

          {effectiveDamage != null && (
            <div className={styles["calculator__effective"]}>
              <span className={styles["calculator__effective-label"]}>
                Effective Attack
              </span>
              <span className={styles["calculator__effective-value"]}>
                {effectiveDamage}
              </span>
              <span className={styles["calculator__effective-note"]}>
                (raw × sharpness × affinity factor)
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
