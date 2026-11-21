"use client";

import { useEffect, useState } from "react";

/**
 * 3D models extracted from the game by packages/mhfu-extract (`export-site`)
 * live under public/models/. Which item has which model is listed per
 * category, so a page only fetches its own list:
 *
 *   /models/manifest/monsters.json        { "<monster name>": NN }
 *   /models/manifest/weapons/<type>.json  { "<weapon name>": NNN }
 *   /models/manifest/armor/<slot>.json    { "<name>" or "<name>|<Sex>": [maleNNN, femaleNNN] }
 *
 * Values are the game's model IDs (0 = none); the file paths are rebuilt
 * from them below.
 */
type Manifest = Record<string, number | [number, number]>;

const manifests = new Map<string, Promise<Manifest | null>>();
/** Manifests that have finished loading, so hooks can read them synchronously. */
const loadedManifests = new Map<string, Manifest | null>();

function loadManifest(name: string): Promise<Manifest | null> {
  let promise = manifests.get(name);
  if (!promise) {
    promise = fetch(`/models/manifest/${name}.json`)
      .then((res) => (res.ok ? (res.json() as Promise<Manifest>) : null))
      .catch(() => null)
      .then((m) => {
        loadedManifests.set(name, m);
        return m;
      });
    manifests.set(name, promise);
  }
  return promise;
}

/** Start loading a manifest ahead of the page that needs it (e.g. from a layout). */
export function prefetchManifest(name: string): void {
  void loadManifest(name);
}

const pad = (id: number, digits: number) => String(id).padStart(digits, "0");

/** Model folder per armor slot, as in the game's player/<m|f>/<folder>/ files. */
const ARMOR_FOLDER: Record<string, string> = {
  helmet: "hair",
  plate: "body",
  gauntlets: "arm",
  waist: "wst",
  leggings: "reg",
};

/** The armor slot an armor model's URL is for (`.../m_hair065.glb`: "helmet"), if it is one. */
export function armorModelSlot(url: string): string | undefined {
  const folder = /\/[mf]_([a-z]+)\d+\.glb$/.exec(url)?.[1];
  return Object.keys(ARMOR_FOLDER).find((slot) => ARMOR_FOLDER[slot] === folder);
}

/** Resolve a value from one manifest once it's loaded; null while loading, when absent, or offline without it. */
function useManifestValue<T>(
  manifest: string | null,
  item: string,
  pick: (m: Manifest) => T | null,
): T | null {
  const [value, setValue] = useState<T | null>(null);
  useEffect(() => {
    let cancelled = false;
    setValue(null);
    if (!manifest) return;
    loadManifest(manifest).then((m) => {
      const found = m ? pick(m) : null;
      if (!cancelled && found) setValue(found);
    });
    return () => {
      cancelled = true;
    };
    // `pick` only reads values `item` encodes, so it isn't a dependency itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest, item]);
  // An already-loaded manifest answers during render, so the model button
  // shows up with the rest of the page instead of a frame later.
  const loaded = manifest ? loadedManifests.get(manifest) : undefined;
  if (loaded !== undefined) return loaded ? pick(loaded) : null;
  return value;
}

/** URL of a monster's model. */
export function useMonsterModel(name: string | undefined): string | null {
  return useManifestValue(name ? "monsters" : null, name ?? "", (m) => {
    const id = name ? m[name] : undefined;
    return typeof id === "number" && id ? `/models/monsters/em${pad(id, 2)}.glb` : null;
  });
}

/** URL of a weapon's model. */
export function useWeaponModel(type: string, name: string | undefined): string | null {
  return useManifestValue(name ? `weapons/${type}` : null, name ?? "", (m) => {
    const id = name ? m[name] : undefined;
    return typeof id === "number" && id ? `/models/weapons/we${pad(id, 3)}.glb` : null;
  });
}

/**
 * An armor piece's [male, female] model IDs in its slot's manifest. Pieces
 * sold per sex under one name are keyed "<name>|<Sex>", so `sex` picks one.
 */
function armorModelIds(m: Manifest, name: string, sex: "Male" | "Female" | null): number[] | null {
  const ids = (sex ? m[`${name}|${sex}`] : undefined) ?? m[name];
  return Array.isArray(ids) ? ids : null;
}

/** The URL of a slot's armor model `id` for one sex; undefined for 0 (none). */
function armorModelUrl(folder: string, sex: "m" | "f", id: number | undefined): string | undefined {
  return id ? `/models/armor/${sex}_${folder}${pad(id, 3)}.glb` : undefined;
}

export interface ArmorModelUrls {
  male?: string;
  female?: string;
}

/** URLs of an armor piece's male and/or female models. `sex` is the piece's data value ("Male", "Female" or "Male/Female"). */
export function useArmorModel(
  slot: string,
  name: string | undefined,
  sex: string | undefined,
): ArmorModelUrls | null {
  const single = sex === "Male" || sex === "Female" ? sex : null;
  const folder = ARMOR_FOLDER[slot];
  const result = useManifestValue(
    name && folder ? `armor/${slot}` : null,
    `${name}|${single}`,
    (m) => {
      if (!name || !folder) return null;
      const ids = armorModelIds(m, name, single);
      if (!ids) return null;
      // A single-sex piece only shows that sex's model.
      const male = single === "Female" ? undefined : armorModelUrl(folder, "m", ids[0]);
      const female = single === "Male" ? undefined : armorModelUrl(folder, "f", ids[1]);
      return male || female ? { male, female } : null;
    },
  );
  return result;
}

/** Each sex's models of an armor set, one per slot that has one, in slot order. */
export interface ArmorSetModelUrls {
  male: string[];
  female: string[];
}

/**
 * The models of a set's pieces (`lib/armor-sets.ts`), per sex; null while the
 * manifests load or until there's a set. Armor models sit on the player's
 * skeleton (mhfu-extract's `export-site`), so one sex's pieces shown together
 * are worn as in the game.
 */
export function useArmorSetModels(
  set: Partial<Record<string, string | null>> | null,
): ArmorSetModelUrls | null {
  const pieces = set
    ? Object.entries(set).filter((entry): entry is [string, string] => !!entry[1])
    : [];
  const key = pieces.map(([slot, name]) => `${slot}\t${name}`).join("\n");
  const [found, setFound] = useState<{ key: string; urls: ArmorSetModelUrls } | null>(null);
  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    const entries = key.split("\n").map((entry) => entry.split("\t") as [string, string]);
    Promise.all(entries.map(([slot]) => loadManifest(`armor/${slot}`))).then((manifests) => {
      const urls: ArmorSetModelUrls = { male: [], female: [] };
      entries.forEach(([slot, name], i) => {
        const m = manifests[i];
        const folder = ARMOR_FOLDER[slot];
        if (!m || !folder) return;
        const male = armorModelUrl(folder, "m", armorModelIds(m, name, "Male")?.[0]);
        const female = armorModelUrl(folder, "f", armorModelIds(m, name, "Female")?.[1]);
        if (male) urls.male.push(male);
        if (female) urls.female.push(female);
      });
      if (!cancelled) setFound({ key, urls });
    });
    return () => {
      cancelled = true;
    };
  }, [key]);
  return found && found.key === key ? found.urls : null;
}

/** One monster hitbox: a capsule in the model's space (see packages/mhfu-extract `monsters/hitboxes.ts`). */
export interface HitboxCapsule {
  /** Hitzone row the capsule takes its values from. */
  row: number;
  /** The monster's hitzone parts (`Monster.hitzones` keys) on that row. */
  parts: string[];
  /** Body part number (left and right separate): what `Monster.breaks` parts refer to. */
  part: number;
  radius: number;
  start: [number, number, number];
  end: [number, number, number];
}

/** One attack a monster's motion makes (see packages/mhfu-extract `monsters/attacks.ts`). */
export interface MonsterAttack {
  /** The motion's slot (`MotionClip.slot`). */
  slot: number;
  /** Motion frames (60 fps) it can hit in: from `from` up to, not including, `to`. */
  from: number;
  to: number;
  power: number;
  reaction: number;
  stun: number;
  /** Its shapes, each on a joint (the model's `bone_<joint>`), placed in the bind pose. */
  capsules: {
    joint: number;
    radius: number;
    start: [number, number, number];
    end: [number, number, number];
  }[];
}

const sideFiles = new Map<string, Promise<unknown[] | null>>();

/**
 * A list from a file next to a monster's model (`emNN.<kind>.json`, read
 * as `{ [key]: [...] }`); null while loading, or if it has none.
 */
function useModelFile<T>(modelUrl: string | null, kind: string, key: string): T[] | null {
  const [items, setItems] = useState<T[] | null>(null);
  useEffect(() => {
    let cancelled = false;
    setItems(null);
    if (!modelUrl) return;
    const url = modelUrl.replace(/\.glb$/, `.${kind}.json`);
    let promise = sideFiles.get(url);
    if (!promise) {
      promise = fetch(url)
        .then((res) => (res.ok ? (res.json() as Promise<Record<string, unknown[]>>) : null))
        .then((file) => (file?.[key]?.length ? file[key] : null))
        .catch(() => null);
      sideFiles.set(url, promise);
    }
    promise.then((found) => {
      if (!cancelled) setItems(found as T[] | null);
    });
    return () => {
      cancelled = true;
    };
  }, [modelUrl, kind, key]);
  return items;
}

/**
 * A monster's hitboxes, from the file next to its model
 * (`/models/monsters/emNN.hitboxes.json`); null while loading or if it has none.
 */
export function useMonsterHitboxes(modelUrl: string | null): HitboxCapsule[] | null {
  return useModelFile<HitboxCapsule>(modelUrl, "hitboxes", "capsules");
}

/**
 * Slots of a monster's motions that nothing in the game plays, from the
 * file next to its model (`/models/monsters/emNN.unused-motions.json`, see
 * packages/mhfu-extract `monsters/motion-use.ts`); null while loading, or
 * if it has none or they couldn't be told.
 */
export function useMonsterUnusedMotions(modelUrl: string | null): number[] | null {
  return useModelFile<number>(modelUrl, "unused-motions", "unused");
}

/**
 * A monster's attacks, from the file next to its model
 * (`/models/monsters/emNN.attacks.json`); null while loading or if it has none.
 */
export function useMonsterAttacks(modelUrl: string | null): MonsterAttack[] | null {
  return useModelFile<MonsterAttack>(modelUrl, "attacks", "attacks");
}
