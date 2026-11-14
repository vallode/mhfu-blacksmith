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
      map: "Mapa",
      shops: "Tiendas",
      trades: "Trueques",
      combining: "Combinar",
    },
    noSources:
      "Ningún monstruo, recompensa de misión, punto de recolección, tienda, trueque ni combinación da este objeto.",
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
  veggieElder: {
    gives: "El Anciano Vegetal lo da por",
    takes: "Cámbialo al Anciano Vegetal por",
    rareTrade: "Trueque raro",
    listPlace: (ground: string, row: number) => `${ground} n.º ${row}`,
    itemNote:
      "Toma el primer objeto de su lista que lleves, y cada zona de caza tiene su propia lista (el n.º es el puesto en ella). La habilidad de cocina Negociador Felyne hace raros todos los trueques.",
    loadError: "No se pudieron cargar los trueques del Anciano Vegetal.",
    loading: "Cargando trueques…",
    groundGroup: "Zona de caza",
    previousGround: "Zona de caza anterior",
    nextGround: "Zona de caza siguiente",
    groundOf: (n: number, total: number) => `Zona de caza ${n} de ${total}`,
    listNumber: "N.º en lista:",
    heGives: "Te da:",
    pageNote:
      "Toma el primer objeto de su lista que lleves, así que gana el que esté más arriba. La habilidad de cocina Negociador Felyne hace raros todos los trueques.",
    pickItem:
      "Elige un objeto para ver qué da el Anciano Vegetal por él. Cada zona de caza tiene su propia lista.",
  },
  wishlist: {
    title: "Lista de deseos",
    materials: "Materiales",
    whereToGo: "Adónde ir",
    empty:
      "Tu lista de deseos está vacía. Pulsa la estrella junto al nombre de un arma o pieza de armadura para añadirla, y aquí se sumarán sus materiales y dónde conseguirlos. La lista se guarda en este navegador.",
    loadError: "No se pudo cargar el equipo de la lista de deseos.",
    retry: "Reintentar",
    whereToGoNote: "Los monstruos y mapas que dan más de los materiales que aún te faltan.",
    owned: "OBTENIDO",
    remove: "Quitar",
    removeLabel: (name: string) => `Quitar ${name} de la lista de deseos`,
    missingGear: "Ya no está en los datos de esta versión.",
    ownedNote: "Tu cazador ya lo tiene, así que sus materiales no se cuentan.",
    noRecipe: "Ninguna receta lo crea.",
    recipe: "Receta",
    recipes: { create: "Crear", alt: "Receta alt.", improve: "Mejorar" },
    stepRecipes: { create: "(crear)", alt: "(receta alt.)", improve: "(mejorar)" },
    from: "Desde",
    ownedOption: (name: string) => `${name} (obtenido)`,
    wholePath: "Nada (toda la ruta)",
    cost: "Precio:",
    youHave: (amount: string) => `(tienes ${amount})`,
    materialsCount: "Materiales:",
    stillToGet: (n: number, missing: string, total: string) =>
      n === 1 ? `falta ${missing} de ${total}` : `faltan ${missing} de ${total}`,
    nothingLeft: "No queda nada por crear.",
    loadSave: "Carga una partida en el Perfil de cazador para contar lo que ya tienes.",
    forGear: (names: string) => `Para ${names}`,
    more: (_n: number, count: string) => `${count} más…`,
    noSource: "Sin fuente conocida.",
    ways: {
      kinds: {
        shop: "Comprar",
        monster: "Cazar",
        gather: "Recoger",
        quest: "Misión",
        combine: "Combinar",
      },
      shop: "Tienda",
      stageStock: (stage: number) => `En la fase ${stage}`,
      gatherKinds: { gather: "Recolección", mine: "Minería", bug: "Bichos" },
      onlyOnQuests: (n: number, count: string) =>
        n === 1 ? `solo en ${count} misión` : `solo en ${count} misiones`,
      questReward: (stars: string) => `recompensa ${stars}`,
      pokkePoints: (amount: string) => `${amount} ptos.`,
    },
    gatheringIn: (group: string) => `Recolección · ${group}`,
    materialCount: (n: number, count: string) =>
      n === 1 ? `${count} material` : `${count} materiales`,
  },
};
