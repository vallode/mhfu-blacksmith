"use client";

/**
 * The wanted-skills list of the set builder: the chosen skills, each with a
 * remove button, and a search box to add one. Picking a skill from a tree
 * that's already in the list replaces it ("Attack Up (Small)" ->
 * "Attack Up (Large)").
 */
import { useId, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import * as ui from "@/styles/settings";
import type { SkillActivation } from "@/lib/set-search";

export type SkillOption = SkillActivation & { tree: string };

const MAX_SUGGESTIONS = 8;

const row = "flex min-h-[3.4rem] items-center gap-[1rem] border-b border-white/15 px-[0.4rem]";

export default function SkillPicker({
  skills,
  value,
  onChange,
}: {
  /** Every skill that can be picked. */
  skills: SkillOption[];
  /** The chosen skills, by name. */
  value: string[];
  onChange: (value: string[]) => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const byName = useMemo(() => new Map(skills.map((s) => [s.name, s])), [skills]);
  const chosen = value.map((name) => byName.get(name)).filter((s) => s !== undefined);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return skills
      .filter(
        (s) =>
          !value.includes(s.name) &&
          (s.name.toLowerCase().includes(q) || s.tree.toLowerCase().includes(q)),
      )
      .slice(0, MAX_SUGGESTIONS);
  }, [skills, value, query]);

  const pick = (skill: SkillOption) => {
    const sameTree = value.findIndex((name) => byName.get(name)?.tree === skill.tree);
    onChange(
      sameTree >= 0
        ? value.map((v, i) => (i === sameTree ? skill.name : v))
        : [...value, skill.name],
    );
    setQuery("");
    setActive(0);
  };

  const expanded = open && suggestions.length > 0;
  const listId = `${id}-list`;

  return (
    <div className="flex flex-col gap-[0.8rem]">
      {chosen.length > 0 && (
        <ul className="m-0 list-none p-0">
          {chosen.map((s) => (
            <li key={s.name} className={row}>
              <span className="min-w-0 flex-1 truncate text-white">{s.name}</span>
              <span className="text-fine text-white/50">
                {s.tree} {s.points}
              </span>
              <button
                type="button"
                className="cursor-pointer border-none bg-transparent px-[0.6rem] font-[inherit] text-sub leading-none text-white/50 hover:text-negative focus-visible:text-negative"
                aria-label={`Remove ${s.name}`}
                onClick={() => onChange(value.filter((v) => v !== s.name))}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="relative">
        <input
          className={ui.searchInput}
          type="search"
          role="combobox"
          aria-label="Add a skill"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded ? `${id}-${active}` : undefined}
          placeholder={chosen.length ? "Add another skill…" : "Add a skill, e.g. Attack Up"}
          value={query}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setQuery(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={(e) => {
            if (!expanded) return;
            if (e.key === "ArrowDown" || e.key === "ArrowUp") {
              e.preventDefault();
              const by = e.key === "ArrowDown" ? 1 : -1;
              setActive((i) => (i + by + suggestions.length) % suggestions.length);
            } else if (e.key === "Enter") {
              e.preventDefault();
              pick(suggestions[active]);
            } else if (e.key === "Escape") {
              setOpen(false);
            }
          }}
        />
        {expanded && (
          <ul
            id={listId}
            role="listbox"
            className="absolute inset-x-0 top-full z-20 m-0 list-none border border-t-0 border-hr bg-black/90 p-0"
          >
            {suggestions.map((s, i) => (
              <li
                key={s.name}
                id={`${id}-${i}`}
                role="option"
                aria-selected={i === active}
                className={cn(row, "cursor-pointer px-[1rem]", i === active && "hover-glow")}
                // mousedown, not click: the input's blur would close the list first
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span className="min-w-0 flex-1 truncate text-white">{s.name}</span>
                <span className="text-fine text-white/50">
                  {s.tree} {s.points}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
