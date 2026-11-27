"use client";

import { useId, useLayoutEffect, useRef, useState } from "react";
import { cn } from "@/lib/cn";

export interface Tab {
  id: string;
  label: string;
  content: React.ReactNode;
}

const tabButton = [
  "cursor-pointer border-0 border-b-[3px] border-transparent bg-transparent px-[1.2rem] py-[0.4rem]",
  "mobile:px-[0.2rem] compact:px-[0.2rem]",
  "font-[inherit] text-small tracking-game text-parchment",
  "hover:text-white focus-visible:text-white focus-visible:outline-none",
  "aria-selected:border-stat aria-selected:bg-selector aria-selected:text-stat",
].join(" ");

/**
 * A tab row in the style of the game's menu headers, showing one panel at a
 * time. The first tab starts selected; give the component a `key` to reset
 * it when its subject changes. Pass `active` and `onChange` to control it.
 *
 * In narrow panes (phones, and the compact layout's detail pane) the tabs
 * line up in equal columns that fill the width instead of wrapping into
 * ragged rows: as few rows as the longest label allows, as evenly filled as
 * they can be (four tabs two and two, not three and one).
 */
export default function Tabs({
  tabs,
  label,
  active: controlled,
  onChange,
  oneRow,
  sticky,
}: {
  tabs: Tab[];
  label: string;
  active?: string;
  onChange?: (id: string) => void;
  /** On phones, one row of tabs as wide as their labels (scrolling sideways if they must) instead of equal columns. */
  oneRow?: boolean;
  /** On phones, the tab row stays at the top of the card as its content scrolls. */
  sticky?: boolean;
}) {
  const prefix = useId();
  const list = useRef<HTMLDivElement>(null);
  const sizer = useRef<HTMLSpanElement>(null);
  const [columns, setColumns] = useState<number>();
  // The narrowest column the longest label fits in, on one line.
  const longest = tabs.length > 0 ? Math.max(...tabs.map((t) => t.label.length)) : 0;
  useLayoutEffect(() => {
    const el = list.current;
    const min = sizer.current;
    if (!el || !min) return;
    const fit = () => {
      if (getComputedStyle(el).display !== "grid") return setColumns(undefined);
      const across = Math.max(1, Math.floor(el.clientWidth / min.offsetWidth));
      const rows = Math.ceil(tabs.length / across);
      setColumns(Math.ceil(tabs.length / rows));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    // The measuring span changes width with the font and the labels, not the strip.
    observer.observe(min);
    return () => observer.disconnect();
  }, [tabs.length, longest]);
  const [uncontrolled, setUncontrolled] = useState(tabs[0]?.id);
  const active = controlled ?? uncontrolled;
  const setActive = (id: string) => {
    setUncontrolled(id);
    onChange?.(id);
  };
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  if (!current) return null;
  const columnStyle = {
    "--tab-min": `calc(${longest} * var(--cell) + 0.4rem)`,
    ...(columns && { "--tab-cols": columns }),
  } as React.CSSProperties;

  return (
    <div className="flex flex-col gap-[1.6rem]">
      <div
        ref={list}
        role="tablist"
        aria-label={label}
        style={columnStyle}
        className={cn(
          "relative flex flex-wrap gap-[0.4rem] border-b border-hr/50 text-small",
          "mobile:grid mobile:grid-cols-[repeat(var(--tab-cols,auto-fit),minmax(var(--tab-min),1fr))] mobile:gap-0",
          "compact:grid compact:grid-cols-[repeat(var(--tab-cols,auto-fit),minmax(var(--tab-min),1fr))] compact:gap-0",
          oneRow &&
            "mobile:flex mobile:[scrollbar-width:none] mobile:flex-nowrap mobile:overflow-x-auto",
          sticky && "mobile:sticky mobile:top-0 mobile:z-2 mobile:bg-(--card-fill)",
        )}
      >
        {/* Measures --tab-min, out of the grid's flow. */}
        <span ref={sizer} aria-hidden className="invisible absolute w-(--tab-min)" />
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${prefix}-tab-${t.id}`}
            aria-selected={t.id === current.id}
            aria-controls={`${prefix}-panel-${t.id}`}
            className={cn(tabButton, oneRow && "mobile:flex-auto mobile:whitespace-nowrap")}
            onClick={() => setActive(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`${prefix}-panel-${current.id}`}
        aria-labelledby={`${prefix}-tab-${current.id}`}
      >
        {current.content}
      </div>
    </div>
  );
}
