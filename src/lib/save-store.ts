const KEY = "mhfu_save";

export interface ItemSlot {
  id: number;
  qty: number;
}

export interface SaveData {
  name: string;
  region: string;
  items: ItemSlot[];
  savedAt: number;
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
