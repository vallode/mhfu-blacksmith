// Class strings for the data tables. The markup stays plain <table>/<th>/<td>;
// cell styles are applied from the <table> with descendant variants, e.g.
// `[&_th]:text-warm` styles every <th> inside the table.

/**
 * Compact stat tables on weapon pages: ammo capacities, melody combos.
 * First header is gold, the rest orange; the last column takes the slack.
 */
export const statTable = [
  "h-min flex-1 border-collapse text-[2.6rem] leading-[1.25] font-medium",
  "[&_td]:w-min [&_td]:pr-[1rem] [&_td]:text-left [&_td]:font-medium [&_td]:whitespace-nowrap",
  "[&_th]:w-min [&_th]:pr-[1rem] [&_th]:text-left [&_th]:font-medium [&_th]:whitespace-nowrap [&_th]:text-warm",
  "[&_th:first-of-type]:text-gold [&_th:last-of-type]:w-full",
  // The ":" separator column
  "[&_td:nth-of-type(2)]:text-center",
].join(" ");

/**
 * Monster hitzone table: part names left-aligned, values right-aligned in
 * fixed-width columns with thin separators between them. Normal tracking:
 * nine columns are too tight for the game tracking on a phone.
 */
export const hitzoneTable = [
  "h-min w-full table-fixed border-collapse text-[1.4rem] tracking-normal tabular-nums",
  "[&_th]:pr-[0.8rem] [&_th]:pb-[0.4rem] [&_th]:text-right [&_th]:font-normal [&_th]:text-warm",
  // Part names ("Chest-Broken") fit on one line; on a phone the column is
  // narrower and they wrap instead.
  "[&_th:first-of-type]:w-cells-13 [&_th:first-of-type]:text-left [&_th:first-of-type]:text-gold mobile:[&_th:first-of-type]:w-cells-7",
  "[&_td]:relative [&_td]:py-[0.2rem] [&_td]:pr-[0.8rem] [&_td]:text-right [&_td:first-of-type]:text-left [&_td:first-of-type]:whitespace-nowrap [&_td:first-of-type]:capitalize mobile:[&_td:first-of-type]:whitespace-normal",
  // Column separators (none after the last column)
  "[&_td:not(:last-of-type)]:after:absolute [&_td:not(:last-of-type)]:after:top-1/2 [&_td:not(:last-of-type)]:after:right-px [&_td:not(:last-of-type)]:after:h-[60%] [&_td:not(:last-of-type)]:after:w-px [&_td:not(:last-of-type)]:after:-translate-y-1/2 [&_td:not(:last-of-type)]:after:bg-unavailable [&_td:not(:last-of-type)]:after:opacity-50",
].join(" ");

/** Hitzone value: the highest in its column is highlighted; zero is dimmed. */
export const hitzoneBest = "text-positive";
export const hitzoneZero = "text-unavailable";
