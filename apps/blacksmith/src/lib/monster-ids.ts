import type { MonsterRecord } from "./save-store";

/**
 * The game's monster ID (its `emID`) for every monster on the site. The
 * save's monster tables (kills, captures, size records) are indexed by it.
 * From packages/mhfu-extract's src/overlay/monsters.json, which pairs each disc
 * monster with its site name. IDs the site has no page for (0 none, 10 Veggie
 * Elder, 18 Cat Cart, 29 Rocks, 32 Poogie, 72 a second Yama Tsukami, 74 Miner
 * Wyverian) are left out.
 */
export const MONSTER_GAME_IDS: Readonly<Record<string, number>> = {
  Akantor: 76,
  Anteka: 69,
  Apceros: 25,
  Aptonoth: 12,
  "Ashen Lao-Shan Lung": 50,
  "Azure Rathalos": 49,
  Basarios: 22,
  "Black Diablos": 43,
  "Black Gravios": 47,
  Blango: 61,
  Blangonga: 51,
  "Blue Yian Kut-Ku": 38,
  Bulldrome: 68,
  Bullfango: 5,
  Ceanataur: 73,
  Cephadrome: 8,
  Cephalos: 34,
  Chameleos: 59,
  Conga: 62,
  Congalala: 52,
  "Copper Blangonga": 84,
  "Crimson Fatalis": 36,
  "Daimyo Hermitaur": 48,
  Diablos: 14,
  "Emerald Congalala": 85,
  Fatalis: 2,
  Felyne: 9,
  "Furious Rajang": 89,
  Gendrome: 28,
  Genprey: 13,
  Giadrome: 77,
  Giaprey: 35,
  "Gold Rathian": 42,
  Gravios: 17,
  "Great Thunderbug": 56,
  "Green Plesioth": 46,
  Gypceros: 20,
  Hermitaur: 66,
  Hornetaur: 24,
  Hypnocatrice: 82,
  Iodrome: 31,
  Ioprey: 30,
  Kelbi: 3,
  Khezu: 15,
  "King Shakalaka": 79,
  Kirin: 33,
  "Kushala Daora": 54,
  "Lao-Shan Lung": 7,
  Lavasioth: 83,
  Lunastra: 64,
  Melynx: 23,
  Monoblos: 26,
  Mosswine: 4,
  Nargacuga: 81,
  "Pink Rathian": 37,
  Plesioth: 21,
  "Plum Daimyo Hermitaur": 86,
  Popo: 70,
  "Purple Gypceros": 39,
  Rajang: 53,
  Rathalos: 11,
  Rathian: 1,
  "Red Khezu": 45,
  Remobra: 63,
  "Rusted Kushala Daora": 60,
  "Scarred Yian Garuga": 40,
  Shakalaka: 57,
  "Shen Gaoren": 55,
  "Shogun Ceanataur": 67,
  "Silver Rathalos": 41,
  Teostra: 65,
  "Terra Shogun Ceanataur": 87,
  Tigrex: 75,
  Ukanlos: 88,
  Velocidrome: 27,
  Velociprey: 16,
  Vespoid: 19,
  "Vespoid Queen": 80,
  "White Fatalis": 71,
  "White Monoblos": 44,
  "Yama Tsukami": 58,
  "Yian Garuga": 78,
  "Yian Kut-Ku": 6,
};

/**
 * The loaded hunter's records for a site monster: zeros when the save has
 * none for it, null when the save predates monster records or the monster
 * has no game ID.
 */
export function monsterRecordFor(
  monsters: readonly MonsterRecord[] | undefined,
  name: string,
): MonsterRecord | null {
  const id = MONSTER_GAME_IDS[name];
  if (!monsters || id === undefined) return null;
  return (
    monsters.find((m) => m.id === id) ?? { id, kills: 0, captures: 0, largest: 0, smallest: 0 }
  );
}
