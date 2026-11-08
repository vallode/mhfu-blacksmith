"use client";

/**
 * Set builder: an armor set search after Athena's Armor Set Search. Pick the
 * skills you want and the hunter's options; the search (in a worker, see
 * hooks/useSetSearch.ts) lists every armor set with decorations that
 * activates them, highest defence first, shown like the game's equipment
 * set screen.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import BorderRule from "@/components/BorderRule";
import Card from "@/components/Card";
import Icon from "@/components/Icon";
import Tabs from "@/components/Tabs";
import { SelectorRow, ToggleRow, type Choice } from "@/components/SettingRows";
import { useHunterProgress } from "@/context/HunterProgressContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useSave } from "@/context/SaveContext";
import { useSetSearch } from "@/hooks/useSetSearch";
import type { ArmorRank } from "@/lib/constants";
import { tierLabel } from "@/lib/min-rank";
import { buildFromResult, emptyBuild, type BuildSet } from "@/lib/set-build";
import { resolveWanted, selectableSkills, type Piece, type SearchQuery } from "@/lib/set-search";
import * as ui from "@/styles/settings";
import ArmorSetView, { PanelTitle, SetHeader, SetStatus } from "./ArmorSetView";
import SetEditor from "./SetEditor";
import SkillPicker from "./SkillPicker";

interface Form {
  skills: string[];
  hunterType: SearchQuery["hunterType"];
  sex: SearchQuery["sex"];
  rank: ArmorRank;
  weaponSlots: number;
  allowBadSkills: boolean;
  ownedOnly: boolean;
  /** Search armor beyond the quest progress set on the Options page. */
  ignoreQuestProgress: boolean;
}

const DEFAULT_FORM: Form = {
  skills: [],
  hunterType: "Blademaster",
  sex: "Male",
  rank: "g-rank",
  weaponSlots: 0,
  allowBadSkills: false,
  ownedOnly: false,
  ignoreQuestProgress: false,
};

const STORAGE_KEY = "set-builder";

type View = "results" | "editor";

const HUNTER_TYPES: Choice<Form["hunterType"]>[] = [
  { value: "Blademaster", label: "Blademaster" },
  { value: "Gunner", label: "Gunner" },
];
const SEXES: Choice<Form["sex"]>[] = [
  { value: "Male", label: "Male" },
  { value: "Female", label: "Female" },
];
const RANKS: Choice<ArmorRank>[] = [
  { value: "low-rank", label: "Low Rank" },
  { value: "high-rank", label: "High Rank" },
  { value: "g-rank", label: "G Rank" },
];
const WEAPON_SLOTS: Choice<number>[] = [0, 1, 2, 3].map((n) => ({
  value: n,
  label: n === 0 ? "None" : "O".repeat(n).padEnd(3, "-"),
}));

function readForm(): Form {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as Partial<Form> | null;
    return { ...DEFAULT_FORM, ...saved };
  } catch {
    return DEFAULT_FORM;
  }
}

export default function SetBuilderClient() {
  const {
    data,
    loadError,
    searching,
    found,
    result,
    query: searched,
    index,
    setIndex,
    error,
    search,
    cancel,
  } = useSetSearch();
  const progress = useHunterProgress();
  const { save } = useSave();
  const [form, setForm] = useState<Form>(DEFAULT_FORM);
  const [restored, setRestored] = useState(false);

  // Restore the last form (localStorage only exists in the browser).
  useEffect(() => {
    const saved = readForm();
    if (!localStorage.getItem(STORAGE_KEY) && (save?.sex === "Male" || save?.sex === "Female")) {
      saved.sex = save.sex;
    }
    setForm(saved);
    setRestored(true);
    // Only on load; the save's sex is a default, not a binding.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(form));
    } catch {
      // Storage full or blocked: the form just isn't remembered.
    }
  }, [form, restored]);

  const skills = useMemo(() => (data ? selectableSkills(data.trees) : []), [data]);
  const update = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const ownedOnly = form.ownedOnly && progress.active;
  const { questProgress } = usePreferences().prefs;
  const questLimit = form.ignoreQuestProgress ? null : questProgress;
  const runSearch = () => {
    if (!data || form.skills.length === 0) return;
    const query: SearchQuery = {
      skills: form.skills,
      hunterType: form.hunterType,
      sex: form.sex,
      rank: form.rank,
      weaponSlots: form.weaponSlots,
      allowBadSkills: form.allowBadSkills,
      progress: questLimit,
      onlyPieces: ownedOnly
        ? data.pieces.filter((p) => progress.isOwned(p.href)).map((p) => p.id)
        : undefined,
    };
    search(query);
  };

  const sets = result?.sets ?? [];
  const set = sets[Math.min(index, sets.length - 1)] ?? null;
  const step = (by: 1 | -1) => setIndex((index + by + sets.length) % sets.length);
  const weaponIcon = searched?.hunterType === "Gunner" ? "heavy-bowgun" : "great-sword";

  // The set in the editor. Its hunter type and sex are the form's: changing
  // them in the form changes the set's, and opening a set sets the form's.
  const [view, setView] = useState<View>("results");
  const [build, setBuild] = useState<BuildSet>(() => emptyBuild());
  const [openWarnings, setOpenWarnings] = useState<string[]>([]);
  useEffect(() => {
    setBuild((b) =>
      b.hunterType === form.hunterType && b.sex === form.sex
        ? b
        : { ...b, hunterType: form.hunterType, sex: form.sex },
    );
  }, [form.hunterType, form.sex]);

  const openInEditor = useCallback((next: BuildSet, warnings: string[] = []) => {
    setBuild(next);
    setForm((f) => ({ ...f, hunterType: next.hunterType, sex: next.sex }));
    setOpenWarnings(warnings);
    setView("editor");
  }, []);

  const editBuild = (next: BuildSet) => {
    setBuild(next);
    setOpenWarnings([]);
  };

  const wanted = useMemo(
    () => (data ? [...resolveWanted(data.trees, form.skills).wanted.keys()] : []),
    [data, form.skills],
  );
  const isOwned = useMemo(
    () => (progress.active ? (p: Piece) => progress.isOwned(p.href) : undefined),
    [progress],
  );
  const editorWeaponIcon = build.hunterType === "Gunner" ? "heavy-bowgun" : "great-sword";

  let message: React.ReactNode = null;
  if (loadError) message = <p className={ui.error}>Couldn&apos;t load the armor data.</p>;
  else if (!data) message = <p className={ui.note}>Loading armor…</p>;
  else if (error) message = <p className={ui.error}>{error}</p>;
  else if (searching) message = <p className={ui.note}>Searching… {found || ""}</p>;
  else if (!result)
    message = (
      <p className={ui.note}>
        Add the skills you want, then search. Sets are sorted by defence, highest first.
      </p>
    );
  else if (sets.length === 0)
    message = (
      <p className={ui.note}>
        No set activates all of these skills. Try fewer skills, a higher rank, more weapon slots,
        allowing bad skills{searched?.progress ? ", or ignoring your quest progress" : ""}.
      </p>
    );

  return (
    <>
      <nav className="flex w-full items-center justify-start mobile:flex-wrap mobile:justify-center">
        <div>
          <Link href="/" aria-label="Back">
            <Icon type="arrow" nav alt="Back" />
          </Link>
        </div>
        <div className="ml-auto">
          <button
            className="search-trigger flex h-[52px] w-[52px] cursor-pointer items-center border-none bg-transparent p-0 text-white/60 hover:text-white [&>img]:h-full"
            aria-label="Search"
          >
            <img src="/images/binoculars.png" alt="Search" decoding="sync" />
          </button>
        </div>
      </nav>

      <BorderRule />

      <div className="split-page">
        <Card className="max-w-[56rem] gap-[1.3rem] overflow-auto py-7 text-[1.6rem] mobile:max-w-none mobile:flex-none mobile:text-[1.6rem]">
          <PanelTitle>Skills</PanelTitle>
          <form
            className="flex flex-col gap-[1.3rem]"
            onSubmit={(e) => {
              e.preventDefault();
              runSearch();
            }}
          >
            <SkillPicker
              skills={skills}
              value={form.skills}
              onChange={(v) => update("skills", v)}
            />
            <SelectorRow
              label="Hunter"
              choices={HUNTER_TYPES}
              value={form.hunterType}
              onChange={(v) => update("hunterType", v)}
            />
            <SelectorRow
              label="Gender"
              choices={SEXES}
              value={form.sex}
              onChange={(v) => update("sex", v)}
            />
            <SelectorRow
              label="Rank"
              choices={RANKS}
              value={form.rank}
              onChange={(v) => update("rank", v)}
            />
            <SelectorRow
              label="Weapon slots"
              choices={WEAPON_SLOTS}
              value={form.weaponSlots}
              onChange={(v) => update("weaponSlots", v)}
            />
            <ToggleRow
              label="Allow bad skills"
              note="Keep sets that also activate a negative skill, such as Defense -20."
              value={form.allowBadSkills}
              onChange={(v) => update("allowBadSkills", v)}
            />
            {questProgress && (
              <ToggleRow
                label="Ignore quest progress"
                note={
                  <>
                    Your quest progress ({tierLabel(questProgress)}, set on the{" "}
                    <Link className="underline hover:text-white" href="/options/">
                      Options
                    </Link>{" "}
                    page) leaves out armor and decorations that need materials from later quests.
                    Turn on to search all of them.
                  </>
                }
                value={form.ignoreQuestProgress}
                onChange={(v) => update("ignoreQuestProgress", v)}
              />
            )}
            {progress.active && (
              <ToggleRow
                label="Owned armor only"
                note="Only use armor in your hunter's equipment box."
                value={form.ownedOnly}
                onChange={(v) => update("ownedOnly", v)}
              />
            )}
            <div className={ui.actions}>
              <button
                type="submit"
                className={ui.button}
                disabled={!data || searching || form.skills.length === 0}
              >
                Search
              </button>
              {searching && (
                <button type="button" className={ui.buttonSecondary} onClick={cancel}>
                  Cancel
                </button>
              )}
            </div>
          </form>
        </Card>

        <Card className="gap-[1.3rem] overflow-auto py-7 text-[1.6rem] mobile:text-[1.6rem]">
          <Tabs
            label="Set builder"
            active={view}
            onChange={(id) => setView(id as View)}
            tabs={[
              {
                id: "results",
                label: "Results",
                content: (
                  <div className="flex flex-col gap-[1.3rem]">
                    {set ? (
                      <>
                        <SetHeader index={index} count={sets.length} onStep={step} />
                        {result && result.total > sets.length && (
                          <p className={ui.note}>
                            The {sets.length} highest-defence sets of {result.total}
                            {result.truncated ? "+" : ""} found. Add skills to narrow the search.
                          </p>
                        )}
                        {result?.timedOut && (
                          <p className={ui.note}>The search took too long and stopped early.</p>
                        )}
                        <div className={ui.actions}>
                          <button
                            type="button"
                            className={ui.button}
                            onClick={() => searched && openInEditor(buildFromResult(set, searched))}
                          >
                            Edit this set
                          </button>
                        </div>
                        <ArmorSetView
                          set={set}
                          weaponSlots={searched?.weaponSlots ?? 0}
                          weaponIcon={weaponIcon}
                          status={
                            <>
                              <PanelTitle>Status</PanelTitle>
                              <SetStatus set={set} />
                            </>
                          }
                        />
                      </>
                    ) : (
                      <>
                        <PanelTitle>Set Builder</PanelTitle>
                        {message}
                      </>
                    )}
                    {set && searching && message}
                  </div>
                ),
              },
              {
                id: "editor",
                label: "Editor",
                content: (
                  <>
                    {data ? (
                      <SetEditor
                        data={data}
                        set={build}
                        onChange={editBuild}
                        wanted={wanted}
                        rank={form.rank}
                        questLimit={questLimit}
                        ownedOnly={ownedOnly}
                        isOwned={isOwned}
                        weaponIcon={editorWeaponIcon}
                        extraWarnings={openWarnings}
                        title={
                          <div className="flex flex-wrap items-center gap-[0.8rem]">
                            <span className="flex-1">
                              <PanelTitle>Edit set</PanelTitle>
                            </span>
                            <button
                              type="button"
                              className={ui.buttonSecondary}
                              onClick={() =>
                                editBuild(emptyBuild(form.hunterType, form.sex, build.weaponSlots))
                              }
                            >
                              Clear
                            </button>
                          </div>
                        }
                      />
                    ) : (
                      message
                    )}
                  </>
                ),
              },
            ]}
          />
        </Card>
      </div>
    </>
  );
}
