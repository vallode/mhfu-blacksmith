"use client";

import { useId, useState } from "react";

export interface Tab {
  id: string;
  label: string;
  content: React.ReactNode;
}

const tabButton = [
  "cursor-pointer border-0 border-b-[3px] border-transparent bg-transparent px-[1.2rem] py-[0.4rem]",
  "font-[inherit] text-[1.6rem] tracking-game text-parchment",
  "hover:text-white focus-visible:text-white focus-visible:outline-none",
  "aria-selected:border-stat aria-selected:bg-selector aria-selected:text-stat",
].join(" ");

/**
 * A tab row in the style of the game's menu headers, showing one panel at a
 * time. The first tab starts selected; give the component a `key` to reset
 * it when its subject changes. Pass `active` and `onChange` to control it.
 */
export default function Tabs({
  tabs,
  label,
  active: controlled,
  onChange,
}: {
  tabs: Tab[];
  label: string;
  active?: string;
  onChange?: (id: string) => void;
}) {
  const prefix = useId();
  const [uncontrolled, setUncontrolled] = useState(tabs[0]?.id);
  const active = controlled ?? uncontrolled;
  const setActive = (id: string) => {
    setUncontrolled(id);
    onChange?.(id);
  };
  const current = tabs.find((t) => t.id === active) ?? tabs[0];
  if (!current) return null;

  return (
    <div className="flex flex-col gap-[1.6rem]">
      <div
        role="tablist"
        aria-label={label}
        className="flex flex-wrap gap-[0.4rem] border-b border-hr/50"
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            id={`${prefix}-tab-${t.id}`}
            aria-selected={t.id === current.id}
            aria-controls={`${prefix}-panel-${t.id}`}
            className={tabButton}
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
