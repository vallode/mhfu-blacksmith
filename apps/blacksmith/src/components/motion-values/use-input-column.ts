"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";

/** Where a damage table shows its moves' inputs: their own column before the names, or under them. */
export type InputPlace = "column" | "under";

/**
 * Whether the damage table fits its box with the inputs in a column of their
 * own, every name on one line: the table's widest layout with the column
 * against the box's width, measured again on every render, whenever either
 * changes size, and once the web font loads. The column's room depends on the weapon's columns,
 * names and inputs, so it's measured rather than set by a breakpoint.
 * `ready`: the table is rendered (its data is in).
 */
export function useInputColumn(ready: boolean) {
  const box = useRef<HTMLDivElement>(null);
  const table = useRef<HTMLTableElement>(null);
  const [place, setPlace] = useState<InputPlace>("column");

  const measure = useCallback(() => {
    const b = box.current;
    const t = table.current;
    if (!b || !t) return;
    // Laid out with the column at its widest, then put back before paint.
    const shown = t.dataset.inputs;
    t.dataset.inputs = "column";
    t.style.width = "max-content";
    const needed = t.offsetWidth;
    t.style.width = "";
    t.dataset.inputs = shown;
    setPlace(needed <= b.clientWidth ? "column" : "under");
  }, []);

  // Every render: the table's content (weapon, settings, language) can
  // change what it needs without changing its size.
  useLayoutEffect(measure);

  // Its box resizing, and the web font's metrics once it loads.
  useLayoutEffect(() => {
    const b = box.current;
    const t = table.current;
    if (!b || !t) return;
    let live = true;
    const observer = new ResizeObserver(measure);
    observer.observe(b);
    observer.observe(t);
    document.fonts?.ready.then(() => live && measure());
    return () => {
      live = false;
      observer.disconnect();
    };
  }, [ready, measure]);

  return { box, table, place };
}
