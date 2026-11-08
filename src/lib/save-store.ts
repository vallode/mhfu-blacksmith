const KEY = "mhfu_save";

export interface ItemSlot {
  id: number;
  qty: number;
}

/** One used equipment box slot: `type` is the equip type code (0–6), `id` the equipment ID. */
export interface EquipSlot {
  type: number;
  id: number;
  /** Item IDs (data/items.json) of the attached decorations. Missing on saves stored before they were read. */
  decorations?: number[];
}

export interface SaveData {
  name: string;
  region: string;
  /** Item box and pouch together. */
  items: ItemSlot[];
  /** Missing on saves stored before zenny was kept. */
  zenny?: number;
  /** Missing on saves stored before the equipment box was read. */
  equipment?: EquipSlot[];
  /** Missing on saves stored before these were kept. */
  sex?: string;
  /** Total play time in seconds. */
  playTime?: number;
  /** 0-based character slot in the save file. Missing on saves stored before it was kept. */
  slot?: number;
  savedAt: number;
}

/** The parts of a parsed hunter that get stored. */
export function saveFromCharacter(
  character: {
    name: string;
    sex?: string;
    zenny: number;
    playTime?: number;
    itemChest: ItemSlot[];
    itemPouch: ItemSlot[];
    equipBox: EquipSlot[];
  },
  region: string,
  slot?: number,
): Omit<SaveData, "savedAt"> {
  return {
    name: character.name,
    region,
    items: [...character.itemChest, ...character.itemPouch],
    zenny: character.zenny,
    equipment: character.equipBox,
    sex: character.sex,
    playTime: character.playTime,
    slot,
  };
}

export function setSave(data: Omit<SaveData, "savedAt">): void {
  localStorage.setItem(KEY, JSON.stringify({ ...data, savedAt: Date.now() }));
}

export function getSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as SaveData) : null;
  } catch {
    return null;
  }
}

export function clearSave(): void {
  localStorage.removeItem(KEY);
}
