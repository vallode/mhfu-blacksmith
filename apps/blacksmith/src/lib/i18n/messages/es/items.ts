import { createElement, Fragment, type ReactNode } from "react";
import type { Messages } from "../en";

export const items: Messages["items"] = {
  list: {
    filterLabel: "Filtrar todos los objetos por nombre",
    filterPlaceholder: "Filtrar objetos, p. ej. Rathalos",
    loadError: "No se pudieron cargar los objetos.",
    noMatch: "Ningún objeto coincide.",
    // "Todas las categorías" doesn't fit the selector bar at phone width.
    allCategories: "Todos los objetos",
    categoryGroup: "Categoría de objeto",
    previousCategory: "Categoría anterior",
    nextCategory: "Categoría siguiente",
    matchCount: (n: number, count: string) =>
      n === 1 ? `${count} objeto coincide` : `${count} objetos coinciden`,
    categoryOf: (n: number, total: number) => `Categoría ${n} de ${total}`,
    pickItem: "Elige un objeto para ver de qué monstruos y misiones se obtiene.",
  },
  // Abbreviated like the game's own item names, to fit the selector bar.
  categories: {
    books: "Libros",
    consumables: "Consumibles",
    tools: "Herramientas",
    ammo: "Munición y revest.",
    plants: "Plantas",
    ores: "Minerales",
    "armor-spheres": "Esferas armadura",
    fish: "Peces",
    insects: "Insectos",
    "common-materials": "Mat. comunes",
    "monster-materials": "Mat. de monstruos",
    relics: "Reliquias",
    "quest-items": "Objetos de misión",
    "coins-tickets": "Monedas y tiquets",
    jewels: "Joyas",
    treasures: "Tesoros",
    other: "Otros",
  },
  detail: {
    notFound: "No encontrado.",
    category: "Categoría:",
    rarity: "Rareza:",
    carry: "Máx. en bolsa:",
    price: "Precio:",
    owned: "Tienes:",
    tabsLabel: "Dónde conseguirlo y qué se crea con él",
    tabs: {
      monsters: "Monstruos",
      quests: "Misiones",
      gathering: "Recolección",
      shops: "Tiendas",
      combining: "Combinar",
    },
    noSources:
      "Ningún monstruo, recompensa de misión, punto de recolección, tienda ni combinación da este objeto.",
    loadError: (partial: boolean) =>
      partial
        ? "No se pudo cargar todo lo que da este objeto."
        : "No se pudo cargar dónde conseguir este objeto.",
    unknownQuest: (id: number) => `Misión ${id}`,
  },
  gathering: {
    kinds: { gather: "Recolección", mine: "Minería", bug: "Bichos" },
    baseCamp: "Campamento base",
    areas: (areas: number[]) =>
      areas.length === 1 ? `zona ${areas[0]}` : `zonas ${areas.join(", ")}`,
    points: (kind: string, places: string) => `${kind}: ${places}`,
  },
  shops: {
    title: "Tiendas",
    names: {
      "Village general store": "Tienda de la aldea",
      Peddler: "Vendedor ambulante",
      "Guild Hall store": "Tienda del Gremio",
      "Point Exchange": "Canje de puntos",
    },
    pokkePoints: "Puntos Pokke",
    fromStart: "Desde el principio",
    fromStage: (stage: number, total: number) => `Desde la fase ${stage} de ${total}`,
    stagesOf: (stages: number[], total: number) =>
      stages.length === 1
        ? `Fase ${stages[0]} de ${total}`
        : `Fases ${stages.slice(0, -1).join(", ")} y ${stages[stages.length - 1]} de ${total}`,
  },
  combining: {
    madeFrom: "Se obtiene combinando",
    usedIn: "Sirve para crear",
    with: (item: ReactNode): ReactNode => createElement(Fragment, null, "con ", item),
    listNumber: (n: number) => `Lista n.º ${n}`,
    alchemy: "Requiere Alquimia o la Guía de alquimia",
    bomber: "100% con Bombardero",
    trapMaster: "100% con Maestro trampero",
    makes: (odds: string) => `Da ${odds}`,
    booksNote: (last: number, bonuses: string) =>
      `Tasas sin los Libros combos 1–${last} (${bonuses} por tenerlos en orden desde el 1) ni la habilidad Combinación.`,
  },
};
