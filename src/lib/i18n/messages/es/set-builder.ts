import { createElement, Fragment, type ReactNode } from "react";
import type { Messages } from "../en";

const s = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const setBuilder: Messages["setBuilder"] = {
  nav: {
    search: "Buscar",
  },
  hunterTypes: {
    Blademaster: "Espadachín",
    Gunner: "Artillero",
  },
  sexes: {
    Male: "Hombre",
    Female: "Mujer",
  },
  tier: (rank: string, stars: number) => `${rank} ★${stars}`,

  form: {
    title: "Habilidades",
    hunter: "Cazador",
    sex: "Sexo",
    rank: "Rango",
    weaponSlots: "Ranuras del arma",
    noWeaponSlots: "Ninguna",
    allowBadSkills: "Permitir habilidades negativas",
    allowBadSkillsNote:
      "Conservar conjuntos que también activan una habilidad negativa, como Defensa -20.",
    ignoreProgress: "Ignorar progreso de misiones",
    ignoreProgressNote: (tier: string, options: ReactNode) =>
      createElement(
        Fragment,
        null,
        `Tu progreso de misiones (${tier}, fijado en la página `,
        options,
        ") deja fuera las armaduras y adornos que necesitan materiales de misiones posteriores. Actívalo para buscar entre todos.",
      ),
    ownedOnly: "Solo armadura obtenida",
    ownedOnlyNote: "Usar solo la armadura de la caja de equipo de tu cazador.",
    search: "Buscar",
    cancel: "Cancelar",
  },

  tabs: {
    results: "Resultados",
    editor: "Editor",
    sets: "Mis conjuntos",
  },

  results: {
    loadError: "No se pudieron cargar los datos de armadura.",
    loading: "Cargando armaduras…",
    searching: (found: string) => (found ? `Buscando… ${found}` : "Buscando…"),
    intro:
      "Añade las habilidades que quieras y busca. Los conjuntos se ordenan por defensa, de mayor a menor.",
    noSets: (progress: boolean) =>
      progress
        ? "Ningún conjunto activa todas estas habilidades. Prueba con menos habilidades, un rango más alto, más ranuras de arma, permitir habilidades negativas o ignorar tu progreso de misiones."
        : "Ningún conjunto activa todas estas habilidades. Prueba con menos habilidades, un rango más alto, más ranuras de arma o permitir habilidades negativas.",
    truncated: (shown: string, total: string, more: boolean) =>
      `Se muestran los ${shown} conjuntos con más defensa de ${total}${more ? "+" : ""} encontrados. Añade habilidades para acotar la búsqueda.`,
    timedOut: "La búsqueda tardó demasiado y se detuvo antes de terminar.",
    editThis: "Editar este conjunto",
    status: "Estado",
    errors: {
      notLoaded: "Los datos de armadura aún no se han cargado.",
      crashed: "La búsqueda se detuvo de forma inesperada.",
      failed: (detail: string) => `La búsqueda falló: ${detail}`,
    },
  },

  editor: {
    origins: {
      new: "Conjunto nuevo",
      result: "Resultado de búsqueda",
      link: "Conjunto compartido",
    },
    save: "Guardar",
    saveAsNew: "Guardar como nuevo",
    share: "Compartir",
    new: "Nuevo",
    setName: (n: number) => `Conjunto ${n}`,
    copyName: (name: string) => `${name} (copia)`,
    saved: (name: string) => `Guardado: ${name}.`,
    savedAs: (name: string) =>
      `Guardado como ${name}. Puedes cambiarle el nombre en Mis conjuntos.`,
    saveFailedTitle: "No se pudo guardar",
    saveFailed:
      "El almacenamiento del navegador está lleno o bloqueado. Los conjuntos se conservan hasta que salgas de la página.",
    linkCopied: "Enlace copiado",
    copyLink: "Copia este enlace",
    deleted: (name: string) => `Eliminado: ${name}.`,
    undo: "Deshacer",
  },

  open: {
    newerVersion: (format: number) =>
      `Este enlace es de una versión más reciente o desconocida del creador de conjuntos (formato ${format}).`,
    malformed: "El código de conjunto de este enlace está dañado o incompleto.",
    unknownIds:
      "Ninguna de las armaduras ni de los adornos de este enlace existe en esta versión del sitio.",
    dropped: (list: string, count: number) =>
      count === 1
        ? `Se ha omitido ${list}: no existe en esta versión del sitio.`
        : `Se han omitido ${list}: no existen en esta versión del sitio.`,
    droppedPiece: (slot: string, id: number) =>
      `una pieza de ${slot.toLowerCase()} desconocida (ID ${id})`,
    droppedDecoration: (item: number, unknownSlot: boolean) =>
      `un adorno desconocido (objeto ${item})${unknownSlot ? " en una ranura desconocida" : ""}`,
    idsUnavailable:
      "No se pudieron cargar los ID de equipo para abrir este enlace. Inténtalo de nuevo con conexión.",
  },

  setView: {
    weapon: "Arma",
    addJewel: "+ Adorno",
    addJewelLabel: (bin: string) => `Añadir un adorno a las ranuras de ${bin.toLowerCase()}`,
    remove: (name: string) => `Quitar ${name}`,
    weaponSlots: "Ranuras del arma",
    fewerWeaponSlots: "Menos ranuras del arma",
    moreWeaponSlots: "Más ranuras del arma",
    weaponSlotCount: (n: number) => `${n} ${s(n, "ranura del arma", "ranuras del arma")}`,
    sets: "Conjuntos",
    previousSet: "Conjunto anterior",
    nextSet: "Conjunto siguiente",
    setNumber: (n: number) => `Conjunto ${n}`,
    pieceLabel: (slot: string, name: string) => `${slot}: ${name}. Cambiar`,
    emptyLabel: (slot: string) => `${slot}: vacío. Elegir una pieza`,
    choose: "- Elegir -",
    owned: "Obtenida",
    torsoUp: "Torso +",
    activeSkills: "[Habilidades activas]",
    noSkills: "Ninguna",
    allPoints: "Todos los puntos de habilidad",
    alternatives: (n: number) =>
      n === 1
        ? "Otra pieza da los mismos puntos en tus habilidades"
        : `Otras ${n} piezas dan los mismos puntos en tus habilidades`,
    alternativesNote:
      "Sus otras habilidades son distintas, así que un cambio puede añadir o quitar una habilidad.",
  },

  status: {
    defense: "Defensa",
    fireRes: "Res. Fuego",
    waterRes: "Res. Agua",
    thunderRes: "Res. Trueno",
    iceRes: "Res. Hielo",
    dragonRes: "Res. Dragón",
    freeSlots: "Ran. libres",
  },

  warnings: {
    weaponSlots: (max: number, n: number) => `Un arma tiene como máximo ${max} ranuras, no ${n}.`,
    wrongSlot: (piece: string, is: string, slot: string) =>
      `${piece} es armadura de ${is.toLowerCase()}, no de ${slot.toLowerCase()}.`,
    hunterType: (piece: string, hunterType: string) =>
      `${piece} es armadura de ${hunterType.toLowerCase()}.`,
    sex: (piece: string, sex: "Male" | "Female") =>
      `${piece} es solo para ${sex === "Male" ? "cazadores" : "cazadoras"}.`,
    torsoUp: (piece: string) =>
      `${piece} tiene Torso +, que copia las habilidades de la pieza de torso, y no hay ninguna.`,
    emptySlot: (bin: string) =>
      `Hay adornos en la parte de ${bin.toLowerCase()}, que está vacía. No cuentan.`,
    tooManyDecorations: (piece: string | null, used: number, has: number) =>
      `Los adornos de ${piece ?? "el arma"} necesitan ${used} ${s(used, "ranura", "ranuras")}, pero tiene ${has}.`,
  },

  pickers: {
    pieceTitle: (slot: string) => `Armadura de ${slot.toLowerCase()}`,
    decorationTitle: (bin: string, free: number) =>
      `Adorno de ${bin.toLowerCase()} (${free} ${s(free, "ranura libre", "ranuras libres")})`,
    searchArmor: "Buscar armadura por nombre o habilidad",
    searchDecorations: "Buscar adornos por nombre o habilidad",
    searchPlaceholder: "Buscar nombre o habilidad",
    rank: "Rango",
    allRanks: "Todos",
    sortBy: "Ordenar por",
    sorts: {
      skills: "Tus habilidades",
      defence: "Defensa",
      name: "Nombre",
    },
    pieceCount: (hunter: string, sex: string, limited: boolean, n: number, max: number | null) =>
      `${hunter}, ${sex.toLowerCase()}${limited ? ", hasta tu progreso de misiones" : ""}: ${n} ${s(n, "pieza", "piezas")}${max ? ` (se muestran las ${max} primeras; busca para acotar)` : ""}.`,
    decorationCount: (n: number, limited: boolean) =>
      `${n === 1 ? "Cabe 1 adorno" : `Caben ${n} adornos`}${limited ? ", hasta tu progreso de misiones" : ""}.`,
  },

  mySets: {
    empty:
      "Aún no hay conjuntos guardados. Abre un conjunto en el editor (desde un resultado de búsqueda o desde cero) y pulsa Guardar. Los conjuntos se guardan en este navegador.",
    nameLabel: "Nombre del conjunto",
    ok: "Aceptar",
    inEditor: "En el editor",
    open: "Abrir",
    rename: "Renombrar",
    duplicate: "Duplicar",
    delete: "Eliminar",
    renameLabel: (name: string) => `Renombrar ${name}`,
    duplicateLabel: (name: string) => `Duplicar ${name}`,
    deleteLabel: (name: string) => `Eliminar ${name}`,
    cantOpen: "No se puede abrir en esta versión.",
    summary: (hunterType: string, defense: string) => `${hunterType}, Defensa ${defense}`,
  },

  skillPicker: {
    remove: (name: string) => `Quitar ${name}`,
    add: "Añadir una habilidad",
    placeholder: "Habilidad, p. ej. Ataque",
    placeholderMore: "Añadir otra habilidad…",
  },
};
