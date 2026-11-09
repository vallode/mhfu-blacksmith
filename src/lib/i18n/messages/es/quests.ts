import type { Messages } from "../en";

export const quests: Messages["quests"] = {
  hubs: {
    village: "Aldea",
    "low-rank": "Gremio, rango bajo",
    "high-rank": "Gremio, rango alto",
    "g-rank": "Gremio, rango G",
    // "Escuela de entrenamiento" overflows the board list at phone width.
    "training-school": "Entrenamiento",
    "treasure-hunting": "Búsqueda de tesoros",
  },
  search: "Buscar",
  // Short enough for the corner of the quest page, like "CLEAR!!".
  cleared: "SUPERADA",
  loadError: "No se pudieron cargar las misiones.",
  notFound: "No encontrada.",
  board: {
    selectQuest: "Elige una misión.",
    urgent: "Urgente",
    starLevels: "Nivel de estrellas",
    previousStarLevel: "Nivel de estrellas anterior",
    nextStarLevel: "Nivel de estrellas siguiente",
    starLevelOf: (level: number, total: number) => `Nivel de estrellas ${level} de ${total}`,
  },
  detail: {
    urgent: "¡URGENTE!",
    tabsLabel: (quest: string) => `Datos de ${quest}`,
    tabs: {
      details: "Detalles",
      rewards: "Recompensas",
      supplies: "Suministros",
    },
    goal: "Objetivo:",
    failure: "Fracaso:",
    location: "Lugar:",
    timeLimit: "Tiempo límite:",
    minutes: (n: string) => `${n} min`,
    reward: "Recompensa:",
    fee: "Tarifa:",
    requires: "Requiere:",
    monsters: "Monstruos:",
    smallMonsters: "Monstruos pequeños:",
    client: "Cliente:",
  },
  rewards: {
    kinds: {
      main: "Recompensa principal",
      extra: "Recompensa extra",
      conditional: "Recompensa condicional",
    },
    condition: (n: number) => `condición ${n}`,
    unknownItem: (id: number) => `Objeto n.º ${id}`,
    stacks: (n: number) => `${n} lotes`,
  },
};
