"use client";

/**
 * The set builder's wanted skills: the chosen ones as chips (SkillChips),
 * and every skill to choose from (SkillBrowser), listed like the game's
 * menus. Choosing a skill from a tree that's already chosen replaces it
 * ("Attack Up (Small)" -> "Attack Up (Large)").
 */
import { useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import type { SkillActivation } from "@/lib/set-search";
import { chip, chipOff, chipOn, pressable } from "@/styles/set-builder";
import * as ui from "@/styles/settings";

export type SkillOption = SkillActivation & { tree: string };

/** Choose a skill (replacing one from the same tree), or drop it if chosen. */
function toggleSkill(value: string[], skill: SkillOption, all: SkillOption[]): string[] {
  if (value.includes(skill.name)) return value.filter((v) => v !== skill.name);
  const treeOf = new Map(all.map((s) => [s.name, s.tree]));
  const same = value.findIndex((v) => treeOf.get(v) === skill.tree);
  return same >= 0 ? value.map((v, i) => (i === same ? skill.name : v)) : [...value, skill.name];
}

/** The chosen skills as chips that come off with ×, and a chip to add one. */
export function SkillChips({
  value,
  onRemove,
  onAdd,
  addLabel,
}: {
  value: string[];
  onRemove: (name: string) => void;
  onAdd: () => void;
  addLabel: string;
}) {
  return (
    <ul className="m-0 flex list-none flex-wrap gap-[0.8rem] p-0">
      {value.map((name) => (
        <li key={name} className={cn(chip, chipOn, "cursor-default pr-0")}>
          <span>{name}</span>
          <button
            type="button"
            aria-label={`Remove ${name}`}
            className="flex size-[3.2rem] cursor-pointer items-center justify-center border-none bg-transparent p-0 text-sub leading-none text-stat/70 hover:text-negative focus-visible:text-negative"
            onClick={() => onRemove(name)}
          >
            ×
          </button>
        </li>
      ))}
      <li>
        <button type="button" className={cn(chip, chipOff, "border-dashed")} onClick={onAdd}>
          {addLabel}
        </button>
      </li>
    </ul>
  );
}

/**
 * Every skill, by tree: each tree a grey title bar with its activations as
 * rows under it, a yellow box at the left filled when chosen. Tap a row to
 * choose it, tap again to drop it. The filter box and what's chosen stay at
 * the top while the list scrolls, and the list keeps its order as you choose.
 */
export function SkillBrowser({
  skills,
  value,
  onChange,
}: {
  /** Every skill that can be chosen. */
  skills: SkillOption[];
  /** The chosen skills, by name. */
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const [query, setQuery] = useState("");
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const byTree = new Map<string, SkillOption[]>();
    for (const s of skills) {
      if (q && !s.name.toLowerCase().includes(q) && !s.tree.toLowerCase().includes(q)) continue;
      byTree.set(s.tree, [...(byTree.get(s.tree) ?? []), s]);
    }
    return [...byTree.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [skills, query]);

  return (
    <div className="flex flex-col gap-[1.6rem]">
      <div className="sticky top-0 z-1 -mx-[0.4rem] flex flex-col gap-[0.8rem] bg-sheet px-[0.4rem] pb-[0.8rem]">
        <input
          className={cn(ui.searchInput, "min-h-[4.4rem] text-sub")}
          type="search"
          aria-label="Filter skills"
          placeholder="Filter, e.g. attack, evade"
          value={query}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setQuery(e.target.value)}
        />
        <p className="m-0 truncate text-fine text-white/60">
          {value.length === 0 ? (
            "Nothing chosen yet."
          ) : (
            <>
              Chosen: <span className="text-stat">{value.join(", ")}</span>
            </>
          )}
        </p>
      </div>
      {groups.length === 0 && <p className={ui.note}>No skill matches “{query}”.</p>}
      {groups.map(([tree, list]) => {
        const chosen = list.some((s) => value.includes(s.name));
        return (
          <section key={tree} className="flex flex-col" aria-label={tree}>
            <h3
              className={cn(
                "m-0 border-b-[3px] bg-selector px-[1rem] py-[0.6rem] text-small font-normal text-shadow-[0.15rem_0.15rem_black]",
                chosen ? "border-stat text-stat" : "border-white/30 text-parchment",
              )}
            >
              {tree}
            </h3>
            <ul className="m-0 list-none bg-black/25 p-0">
              {list.map((s) => {
                const on = value.includes(s.name);
                return (
                  <li key={s.name}>
                    <button
                      type="button"
                      aria-pressed={on}
                      className={cn(
                        pressable,
                        "grid min-h-[4.6rem] w-full grid-cols-[2.2rem_minmax(0,1fr)_auto] items-center gap-x-[1.2rem] border-b border-white/10 px-[1rem]",
                      )}
                      onClick={() => onChange(toggleSkill(value, s, skills))}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          "size-[2.2rem] border-[3px] border-stat shadow-[0.2rem_0.2rem_0_black]",
                          on ? "bg-stat" : "bg-transparent",
                        )}
                      />
                      <span className={cn("truncate text-sub", on ? "text-stat" : "text-white")}>
                        {s.name}
                      </span>
                      <span className="text-fine text-white/45">{s.points} pts</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
