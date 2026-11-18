/** "sword-and-shield" → "Sword and Shield". */
export const titleCase = (s: string): string =>
  s
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace(/(?<=.) (And|Of|The) /g, (w) => w.toLowerCase());
