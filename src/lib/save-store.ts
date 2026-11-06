const KEY = "mhfu_save";

export interface ItemSlot {
  id: number;
  qty: number;
}

/** One used equipment box slot: `type` is the equip type code (0–6), `id` the equipment ID. */
export interface EquipSlot {
  type: number;
  id: number;
}

export interface SaveData {
  name: string;
  region: string;
  items: ItemSlot[];
  /** Missing on saves stored before the equipment box was read. */
  equipment?: EquipSlot[];
  savedAt: number;
}

/** The parts of a parsed hunter that get stored. */
export function saveFromCharacter(
  character: { name: string; itemChest: ItemSlot[]; itemPouch: ItemSlot[]; equipBox: EquipSlot[] },
  region: string
): Omit<SaveData, "savedAt"> {
  return {
    name: character.name,
    region,
    items: [...character.itemChest, ...character.itemPouch],
    equipment: character.equipBox,
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
