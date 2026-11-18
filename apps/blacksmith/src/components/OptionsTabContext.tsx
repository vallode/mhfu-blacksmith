"use client";

import { createContext, useContext } from "react";
import { cn } from "@/lib/cn";
import { barText } from "@/components/SelectorBar";

/** The Options sections, and which one the desktop tabs show. */
export interface OptionsTabs {
  tabs: { id: string; label: string }[];
  selected: string;
  select: (id: string) => void;
  /** Accessible name of the tab row. */
  label: string;
}

export const OptionsTabsContext = createContext<OptionsTabs | null>(null);

/**
 * The tabs, drawn as the header of whichever card is showing (desktop only;
 * on phones every card shows its own title instead). Each card carries a
 * copy, but only the selected card is on screen.
 */
export function OptionsTabBar() {
  const ctx = useContext(OptionsTabsContext);
  if (!ctx) return null;
  return (
    <div
      role="tablist"
      aria-label={ctx.label}
      className="flex h-full min-w-0 items-stretch gap-[2.4rem]"
    >
      {ctx.tabs.map(({ id, label }) => {
        const on = ctx.selected === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={`options-panel-${id}`}
            className={cn(
              barText,
              "flex cursor-pointer items-center border-0 bg-transparent p-0 font-[inherit] tracking-[0.2em] uppercase focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-white",
              on ? "text-stat" : "text-white/55 hover:text-white",
            )}
            onClick={() => ctx.select(id)}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
