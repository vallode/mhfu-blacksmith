"use client";

/**
 * The prototypes' shared state: the search form, the real set search
 * (useSetSearch), and locking or excluding a result's pieces. A trimmed copy
 * of SetBuilderClient's form handling, without the editor, saved sets or the
 * owned-armor filter, so the layouts can be compared on the same results.
 */
import { useEffect, useMemo, useState } from "react";
import { usePreferences } from "@/context/PreferencesContext";
import { useSetSearch } from "@/hooks/useSetSearch";
import type { ArmorRank } from "@/lib/constants";
import {
  cantWear,
  selectableSkills,
  type Piece,
  type SearchQuery,
  type SortKey,
} from "@/lib/set-search";

export interface ProtoForm {
  skills: string[];
  hunterType: SearchQuery["hunterType"];
  sex: SearchQuery["sex"];
  rank: ArmorRank;
  weaponSlots: number;
  allowBadSkills: boolean;
  ignoreQuestProgress: boolean;
  sort: SortKey;
  locked: string[];
  excluded: string[];
}

const DEFAULT_FORM: ProtoForm = {
  skills: [],
  hunterType: "Blademaster",
  sex: "Male",
  rank: "g-rank",
  weaponSlots: 0,
  allowBadSkills: false,
  ignoreQuestProgress: false,
  sort: "defence",
  locked: [],
  excluded: [],
};

/** Starts from the real set builder's form, then keeps its own. */
const STORAGE_KEY = "set-builder-prototype";
const REAL_KEY = "set-builder";

function readForm(): ProtoForm {
  try {
    const raw = localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem(REAL_KEY);
    return { ...DEFAULT_FORM, ...(JSON.parse(raw ?? "null") as Partial<ProtoForm> | null) };
  } catch {
    return DEFAULT_FORM;
  }
}

const QUERY_KEYS = [
  "skills",
  "hunterType",
  "sex",
  "rank",
  "weaponSlots",
  "allowBadSkills",
  "sort",
  "progress",
  "lockPieces",
  "excludePieces",
] as const;

function sameQuery(a: SearchQuery, b: SearchQuery): boolean {
  return QUERY_KEYS.every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null));
}

export function useProtoSearch() {
  const s = useSetSearch();
  const { data, searching, result, query: searched, search, cancel } = s;
  const [form, setForm] = useState<ProtoForm>(DEFAULT_FORM);
  const [restored, setRestored] = useState(false);
  const { questProgress } = usePreferences().prefs;

  useEffect(() => {
    setForm(readForm());
    setRestored(true);
  }, []);
  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    } catch {
      // Not remembered.
    }
  }, [form, restored]);

  const skills = useMemo(() => (data ? selectableSkills(data.trees) : []), [data]);
  // Skills the data doesn't have (renamed, or a stale form) come off.
  useEffect(() => {
    if (!restored || skills.length === 0) return;
    const known = new Set(skills.map((x) => x.name));
    setForm((f) =>
      f.skills.every((n) => known.has(n))
        ? f
        : { ...f, skills: f.skills.filter((n) => known.has(n)) },
    );
  }, [skills, restored]);
  const byHref = useMemo(() => new Map(data?.pieces.map((p) => [p.href, p]) ?? []), [data]);
  const piecesOf = (hrefs: string[]) =>
    hrefs.flatMap((h) => {
      const p = byHref.get(h);
      return p ? [p] : [];
    });

  const toQuery = (f: ProtoForm): SearchQuery | null =>
    data && f.skills.length > 0
      ? {
          skills: f.skills,
          hunterType: f.hunterType,
          sex: f.sex,
          rank: f.rank,
          weaponSlots: f.weaponSlots,
          allowBadSkills: f.allowBadSkills,
          sort: f.sort,
          progress: f.ignoreQuestProgress ? null : questProgress,
          lockPieces: piecesOf(f.locked)
            .filter((p) => !cantWear(p, f))
            .map((p) => p.id),
          excludePieces: piecesOf(f.excluded).map((p) => p.id),
        }
      : null;

  const run = (f: ProtoForm = form) => {
    const q = toQuery(f);
    if (!q) return;
    if (searching) cancel();
    search(q);
  };

  const update = <K extends keyof ProtoForm>(key: K, value: ProtoForm[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  /** Changes that rerun the search at once (sort chips, lock, exclude). */
  const updateAndRun = (next: ProtoForm) => {
    setForm(next);
    if (searched) run(next);
  };

  const isLocked = (p: Piece) => form.locked.includes(p.href);
  const toggleLock = (p: Piece) =>
    updateAndRun(
      isLocked(p)
        ? { ...form, locked: form.locked.filter((h) => h !== p.href) }
        : {
            ...form,
            locked: [...form.locked.filter((h) => byHref.get(h)?.slot !== p.slot), p.href],
            excluded: form.excluded.filter((h) => h !== p.href),
          },
    );
  const exclude = (p: Piece) =>
    updateAndRun({
      ...form,
      excluded: form.excluded.includes(p.href) ? form.excluded : [...form.excluded, p.href],
      locked: form.locked.filter((h) => h !== p.href),
    });

  // Whether the form asks for something other than the results show.
  const current = toQuery(form);
  const stale = !!current && (!searched || !sameQuery(current, searched));

  const sets = result?.sets ?? [];
  return {
    ...s,
    form,
    update,
    updateAndRun,
    run,
    skills,
    piecesOf,
    isLocked,
    toggleLock,
    exclude,
    stale,
    sets,
    questProgress,
  };
}

export type ProtoSearch = ReturnType<typeof useProtoSearch>;
