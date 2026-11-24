"use client";

/**
 * The monster detail's tab row: one tab per section, with the drop tables for
 * every rank gathered under one Drops tab and a rank selector inside it, so
 * the row stays short as more sections are added.
 */
import { useId, useLayoutEffect, useRef, useState } from "react";
import Tabs, { type Tab } from "@/components/Tabs";

/**
 * A tab, plus the group it belongs to when several tabs show the same kind of
 * data (the drop tables, one per rank).
 */
export interface MonsterTab extends Tab {
  group?: { id: string; label: string };
}

/** A top-level section: one tab, or a group of near-identical tabs. */
interface Section {
  id: string;
  label: string;
  tabs: MonsterTab[];
}

function groupSections(tabs: MonsterTab[]): Section[] {
  const sections: Section[] = [];
  for (const tab of tabs) {
    if (tab.group) {
      const section = sections.find((s) => s.id === tab.group!.id);
      if (section) section.tabs.push(tab);
      else sections.push({ id: tab.group.id, label: tab.group.label, tabs: [tab] });
    } else {
      sections.push({ id: tab.id, label: tab.label, tabs: [tab] });
    }
  }
  return sections;
}

const rankButton = [
  "cursor-pointer bg-sheet px-[0.6rem] py-[0.2rem]",
  "font-[inherit] text-fine tracking-game text-parchment",
  "hover:text-white focus-visible:text-white focus-visible:outline-none",
  "aria-selected:bg-selector aria-selected:text-stat",
].join(" ");

/** The tabs of one group (drop tables by rank) as a selector strip. */
function GroupPanel({
  section,
  active,
  onChange,
}: {
  section: Section;
  active: string;
  onChange: (id: string) => void;
}) {
  const prefix = useId();
  const current = section.tabs.find((t) => t.id === active) ?? section.tabs[0]!;
  const strip = useRef<HTMLDivElement>(null);
  const sizer = useRef<HTMLSpanElement>(null);
  const [columns, setColumns] = useState<number>();
  const longest = Math.max(...section.tabs.map((tab) => tab.label.length));

  // In narrow panes, lay the ranks out in equal columns (as Tabs does for the
  // section row) instead of wrapping into a ragged last row.
  useLayoutEffect(() => {
    const el = strip.current;
    const min = sizer.current;
    if (!el || !min) return;
    const fit = () => {
      if (getComputedStyle(el).display !== "grid") return setColumns(undefined);
      const across = Math.max(1, Math.floor(el.clientWidth / min.offsetWidth));
      const rows = Math.ceil(section.tabs.length / across);
      setColumns(Math.ceil(section.tabs.length / rows));
    };
    fit();
    const observer = new ResizeObserver(fit);
    observer.observe(el);
    // The measuring span changes width with the font and the labels, not the strip.
    observer.observe(min);
    return () => observer.disconnect();
  }, [section.tabs.length, longest]);
  const style = {
    "--rank-min": `calc(${longest} * var(--cell) + 1.2rem)`,
    ...(columns && { "--rank-cols": columns }),
  } as React.CSSProperties;

  return (
    <div className="flex flex-col gap-[1.6rem]">
      <div
        ref={strip}
        role="tablist"
        aria-label={section.label}
        style={style}
        className={[
          "relative flex w-fit max-w-full flex-wrap gap-px border border-hr/50 bg-hr/40 p-px text-fine",
          "mobile:grid mobile:w-full mobile:grid-cols-[repeat(var(--rank-cols,auto-fit),minmax(var(--rank-min),1fr))]",
          "compact:grid compact:w-full compact:grid-cols-[repeat(var(--rank-cols,auto-fit),minmax(var(--rank-min),1fr))]",
        ].join(" ")}
      >
        {/* Measures --rank-min, out of the strip's flow. */}
        <span ref={sizer} aria-hidden className="invisible absolute w-(--rank-min)" />
        {section.tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${prefix}-tab-${tab.id}`}
            aria-selected={tab.id === current.id}
            aria-controls={`${prefix}-panel-${tab.id}`}
            className={rankButton}
            onClick={() => onChange(tab.id)}
          >
            {tab.label}
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

/**
 * The monster detail's sections as tabs. Tabs in the same group collapse into
 * one tab, whose panel carries a small selector between them.
 */
export default function MonsterTabs({ tabs, label }: { tabs: MonsterTab[]; label: string }) {
  const sections = groupSections(tabs);
  const [ranks, setRanks] = useState<Record<string, string>>({});

  if (tabs.length === 0) return null;

  const primary: Tab[] = sections.map((section) =>
    section.tabs.length === 1
      ? {
          id: section.tabs[0]!.id,
          label: section.tabs[0]!.label,
          content: section.tabs[0]!.content,
        }
      : {
          id: section.id,
          label: section.label,
          content: (
            <GroupPanel
              section={section}
              active={ranks[section.id] ?? section.tabs[0]!.id}
              onChange={(id) => setRanks((r) => ({ ...r, [section.id]: id }))}
            />
          ),
        },
  );

  return <Tabs tabs={primary} label={label} />;
}
