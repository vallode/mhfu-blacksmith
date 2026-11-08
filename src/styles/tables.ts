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
  "h-min w-full table-fixed border-collapse text-[1.4rem] tracking-normal",
  "[&_tr_th]:text-center",
  "[&_th:first-of-type]:w-auto [&_th:first-of-type]:text-left [&_th:first-of-type]:text-gold",
  "[&_td]:relative [&_td]:pr-[0.8rem] [&_td]:text-right [&_td:first-of-type]:text-left",
  // Column separators
  "[&_td]:after:absolute [&_td]:after:top-1/2 [&_td]:after:right-px [&_td]:after:h-[60%] [&_td]:after:w-px [&_td]:after:-translate-y-1/2 [&_td]:after:bg-unavailable [&_td]:after:opacity-50",
].join(" ");
