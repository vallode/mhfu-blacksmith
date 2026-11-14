import type { ReactNode } from "react";
import type { Messages } from "../en";

export const site: Messages["site"] = {
  logoAlt: "Herrería",
  nav: {
    weapons: "Armas",
    armor: "Armadura",
    monsters: "Monstruos",
    decorations: "Adornos",
    quests: "Misiones",
    items: "Objetos",
    veggieElder: "Anciano Vegetal",
    sets: "Conjuntos",
    wishlist: "Lista de deseos",
    hunter: "Cazador",
    options: "Opciones",
    home: "Inicio",
    main: "Principal",
    search: "Buscar",
    collapse: "Plegar",
    collapseSidebar: "Plegar menú lateral",
    expandSidebar: "Desplegar menú lateral",
    menu: "Menú",
  },
  language: {
    heading: "Idioma",
    label: "Idioma",
    note: "El idioma del sitio. Los nombres del juego y los textos de misiones que aún no están traducidos se muestran en inglés.",
    auto: "Navegador",
  },
  selector: {
    previous: (name: string) => `${name}: anterior`,
    next: (name: string) => `${name}: siguiente`,
  },
  preferences: {
    title: "Preferencias",
    display: "Pantalla",
    showRawValues: {
      label: "Valores reales",
      note: "Muestra entre corchetes los valores reales de ataque y elemento junto a los del juego.",
    },
    animateHighlights: {
      label: "Resaltado animado",
      note: "Hace parpadear el resaltado verde de las filas señaladas y seleccionadas. Con No, se queda fijo.",
    },
    progress: "Progreso",
    questProgress: {
      label: "Progreso de misiones",
      note: "La misión de gremio más alta que puedes aceptar. Se ocultan las armas y armaduras que necesitan materiales de misiones posteriores. Las misiones de la aldea cuentan como rango bajo.",
      all: "Mostrar todo",
    },
    hunter: "Cazador",
    hunterNote: (link: ReactNode): ReactNode => [
      "Se aplican cuando cargas un cazador en la página ",
      link,
      ".",
    ],
    markOwned: {
      label: "Marcar equipo propio",
      note: "Muestra en dorado, en los árboles de armas, armaduras y adornos, el equipo que tienes en tu caja de equipo.",
    },
    showCraftProgress: {
      label: "Progreso de creación",
      note: "Muestra casillas de materiales en las filas del árbol de armas y resalta las armas que ya puedes crear.",
    },
    showMaterialCounts: {
      label: "Cantidad de materiales",
      note: "Muestra cuántos tienes de cada material de la receta, como tienes/necesitas.",
    },
    checkZenny: {
      label: "Contar zenny",
      note: "Solo cuenta un arma como fabricable si además puedes pagarla.",
    },
    markCleared: {
      label: "Marcar misiones superadas",
      note: "Marca con CLEAR!! las misiones que has superado en los tablones y en las páginas de misiones.",
    },
    showHuntRecords: {
      label: "Registro de caza",
      note: "Muestra en la página de cada monstruo cuántos has cazado y capturado.",
    },
    defaultTreeFilter: {
      label: "Filtro inicial del árbol",
      note: "El filtro del árbol de armas con el que empieza cada visita.",
    },
    reset: "Restablecer",
  },
  saveSync: {
    title: "Sincronizar partida",
    unsupported:
      "Este navegador no permite sincronizar la partida automáticamente. Puedes subir tu archivo de guardado a mano desde la página del cazador.",
    notConnected:
      "Conecta tu archivo de guardado desde la página del cazador para que tu perfil se actualice solo cada vez que vuelvas, sin volver a subirlo.",
    connectedNote: (file: string | null) =>
      `Tu perfil de cazador se actualiza solo desde ${file ?? "tu archivo de guardado"} cada vez que vuelves a este sitio, sin volver a subirlo.`,
    syncing: "Sincronizando…",
    lastSynced: (ago: string) => `Última sincronización: ${ago}`,
    connected: "Conectado",
    needsReconnect: "Hay que volver a dar acceso",
    syncNow: "Sincronizar",
    reconnect: "Reconectar",
    forget: "Olvidar archivo",
    ago: {
      justNow: "ahora mismo",
      minutes: (n: number) => `hace ${n} min`,
      hours: (n: number) => `hace ${n} h`,
      days: (n: number) => `hace ${n} d`,
    },
    errors: {
      hunterMissing: "El cazador que habías elegido ya no está en esta partida.",
      syncFailed: "Error al sincronizar",
      openFailed: "No se pudo abrir el archivo",
      permissionFailed: "No se pudo pedir el permiso",
    },
    filePickerDescription: "Partida guardada de MHFU",
    reconnectToast: {
      title: "Reconectar partida",
      message: (file: string | null) =>
        file
          ? `Vuelve a dar acceso a ${file} para mantener tu perfil de cazador sincronizado.`
          : "Vuelve a dar acceso a tu archivo de guardado para mantener tu perfil de cazador sincronizado.",
      notNow: "Ahora no",
    },
  },
  offline: {
    title: "Datos sin conexión",
    unsupported: "Este navegador no permite descargas para usar sin conexión.",
    note: "Guarda en este dispositivo los datos de armas, armaduras, monstruos y adornos para buscar y navegar sin conexión. Aquí puedes volver a descargarlos o borrarlos cuando quieras, a diferencia del aviso que sale una sola vez.",
    checkingFiles: "Comprobando archivos guardados…",
    filesCached: (cached: number, total: number) => `${cached} / ${total} archivos guardados`,
    error: "Algo ha fallado. Comprueba tu conexión y vuelve a intentarlo.",
    checking: "Comprobando…",
    downloading: (percent: number) => `Descargando… ${percent}%`,
    redownload: "Volver a descargar",
    retry: "Reintentar",
    finish: "Terminar descarga",
    download: "Descargar datos",
    clear: "Borrar datos sin conexión",
    toast: {
      title: "Descargar para usar sin conexión",
      partial: (cached: number, total: number) =>
        `Descarga a medias (${cached}/${total}). Termínala para que la herrería funcione sin conexión.`,
      prompt:
        "Guarda los datos de armas, armaduras y monstruos para buscar y navegar sin conexión.",
      download: "Descargar",
      notNow: "Ahora no",
      progress: (cached: number, total: number, percent: number) =>
        `Descargando… ${cached}/${total} (${percent}%)`,
      readyTitle: "Listo sin conexión",
      ready: (cached: number, total: number) =>
        `${cached} de ${total} archivos guardados: la herrería funciona sin conexión.`,
      failedTitle: "Error en la descarga",
      failed: "Comprueba tu conexión y vuelve a intentarlo.",
      retry: "Reintentar",
    },
    fallback: {
      notSaved: "Esta página no se ha guardado para usarla sin conexión.",
      reconnect: "Ábrela una vez con conexión y desde entonces estará disponible sin ella.",
      home: "Volver al inicio",
    },
  },
  hunter: {
    noData: "Sin datos",
    deselect: "Deseleccionar este cazador",
    time: "Tiempo",
    rank: "RC",
    money: "Dinero",
    selected: " (seleccionado)",
    sex: { Male: "Hombre", Female: "Mujer" },
    reading: "Leyendo partida…",
    drop: "Suelta aquí MHP2NDG.BIN o haz clic para buscarlo",
  },
  search: {
    label: "Buscar",
    placeholder: "Buscar armas, armaduras, monstruos…",
    noResults: "Sin resultados",
    categories: {
      weapon: "arma",
      armor: "armadura",
      decoration: "adorno",
      monster: "monstruo",
      quest: "misión",
      item: "objeto",
      page: "página",
    },
    boards: {
      Low: "Bajo",
      High: "Alto",
      G: "G",
      Village: "Aldea",
      Training: "Escuela",
      Treasure: "Tesoros",
    },
  },
  toast: {
    dismiss: "Cerrar",
  },
};
