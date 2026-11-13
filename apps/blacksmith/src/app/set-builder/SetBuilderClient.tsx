"use client";

/**
 * Set builder: an armor set search after Athena's Armor Set Search, laid out
 * for a phone first. The wanted skills are chips at the top, with the
 * hunter's options in a line under them; both open in sheets (SkillBrowser,
 * SearchOptions). The search (in workers, see hooks/useSetSearch.ts) lists
 * the best armor sets with decorations that activate them, by defence or
 * another sort, one at a time (ResultView). Pieces of a result can be
 * locked into every set or excluded from the next search. Beside the
 * results, the editor builds a set by hand, and My sets keeps saved ones.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Card from "@/components/Card";
import CardBox from "@/components/CardBox";
import Icon from "@/components/Icon";
import Loading from "@/components/Loading";
import Tabs from "@/components/Tabs";
import { useHunterProgress } from "@/context/HunterProgressContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useSave } from "@/context/SaveContext";
import { useToast } from "@/context/ToastContext";
import { useSetSearch } from "@/hooks/useSetSearch";
import { useEquipmentIds } from "@/lib/equipment";
import {
  addSet,
  deleteSet,
  duplicateSet,
  nextSetName,
  readDraft,
  readSavedSets,
  updateSet,
  writeDraft,
  writeSavedSets,
  type SavedSet,
} from "@/lib/saved-sets-store";
import { buildFromResult, emptyBuild, type BuildSet } from "@/lib/set-build";
import {
  buildCodecTables,
  decodeSet,
  describeDecodeError,
  describeDropped,
  encodeSet,
} from "@/lib/set-codec";
import {
  cantWear,
  resolveWanted,
  selectableSkills,
  type Piece,
  type SearchQuery,
} from "@/lib/set-search";
import { pressable, primaryButton } from "@/styles/set-builder";
import * as ui from "@/styles/settings";
import { PanelTitle } from "./ArmorSetView";
import MySets from "./MySets";
import ResultView, { type PieceActions } from "./ResultView";
import SearchBar from "./SearchBar";
import { DEFAULT_FORM, OptionsSummary, SearchOptions, type Form } from "./SearchOptions";
import SetEditor from "./SetEditor";
import Sheet from "./Sheet";
import { SkillBrowser, SkillChips } from "./SkillPicker";

const STORAGE_KEY = "set-builder";

type View = "results" | "editor" | "sets";

type Origin = "new" | "result" | "link";
const ORIGIN_TITLES: Record<Origin, string> = {
  new: "New set",
  result: "Search result",
  link: "Shared set",
};

/** The share link's query parameter: /set-builder/?s=<code>. */
const SHARE_PARAM = "s";

/** The query fields a search's results depend on, to tell whether the form has changed since. */
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
  return (
    QUERY_KEYS.every((k) => JSON.stringify(a[k] ?? null) === JSON.stringify(b[k] ?? null)) &&
    !a.onlyPieces === !b.onlyPieces
  );
}

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
  const byHref = useMemo(() => new Map(data?.pieces.map((p) => [p.href, p]) ?? []), [data]);
  // Locked and excluded pieces the data no longer has (renamed or removed):
  // drop them, so the lists show what the search uses.
  useEffect(() => {
    if (!data || !restored) return;
    setForm((f) => {
      const locked = f.locked.filter((h) => byHref.has(h));
      const excluded = f.excluded.filter((h) => byHref.has(h));
      return locked.length === f.locked.length && excluded.length === f.excluded.length
        ? f
        : { ...f, locked, excluded };
    });
  }, [data, byHref, restored]);
  // Empty until the data loads; links it doesn't have are dropped above.
  const piecesOf = (hrefs: string[]) =>
    hrefs.flatMap((href) => {
      const p = byHref.get(href);
      return p ? [p] : [];
    });
  const pieceIds = (hrefs: string[]) => piecesOf(hrefs).map((p) => p.id);
  // Only locks the hunter can wear: the search ignores the others.
  const lockIds = (hrefs: string[], hunter: Pick<SearchQuery, "hunterType" | "sex">) =>
    piecesOf(hrefs)
      .filter((p) => !cantWear(p, hunter))
      .map((p) => p.id);
  /** The search the form asks for; null until the data loads or with no skills. */
  const queryFor = (f: Form): SearchQuery | null => {
    if (!data || f.skills.length === 0) return null;
    return {
      sort: f.sort,
      lockPieces: lockIds(f.locked, f),
      excludePieces: pieceIds(f.excluded),
      skills: f.skills,
      hunterType: f.hunterType,
      sex: f.sex,
      rank: f.rank,
      weaponSlots: f.weaponSlots,
      allowBadSkills: f.allowBadSkills,
      progress: f.ignoreQuestProgress ? null : questProgress,
      onlyPieces:
        f.ownedOnly && progress.active
          ? data.pieces.filter((p) => progress.isOwned(p.href)).map((p) => p.id)
          : undefined,
    };
  };
  const runSearch = (f: Form = form) => {
    const query = queryFor(f);
    if (!query) return;
    if (searching) cancel();
    search(query);
    setView("results");
  };
  // Locking or excluding a result's piece runs the search behind the results
  // again with only that change (not other edits made in the form since),
  // restarting it if it's still running.
  const changePieces = (next: Form) => {
    setForm(next);
    if (!searched) return;
    if (searching) cancel();
    search({
      ...searched,
      lockPieces: lockIds(next.locked, searched),
      excludePieces: pieceIds(next.excluded),
    });
  };
  const pieceActions: PieceActions = {
    isLocked: (p) => form.locked.includes(p.href),
    onLock: (p) =>
      changePieces(
        form.locked.includes(p.href)
          ? { ...form, locked: form.locked.filter((h) => h !== p.href) }
          : {
              ...form,
              // One locked piece per slot.
              locked: [...form.locked.filter((h) => byHref.get(h)?.slot !== p.slot), p.href],
              excluded: form.excluded.filter((h) => h !== p.href),
            },
      ),
    onExclude: (p) =>
      changePieces({
        ...form,
        excluded: form.excluded.includes(p.href) ? form.excluded : [...form.excluded, p.href],
        locked: form.locked.filter((h) => h !== p.href),
      }),
  };

  const sets = result?.sets ?? [];
  const set = sets[Math.min(index, sets.length - 1)] ?? null;
  const step = (by: 1 | -1) => setIndex((index + by + sets.length) % sets.length);

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

  const wanted = useMemo(
    () => (data ? [...resolveWanted(data.trees, form.skills).wanted.keys()] : []),
    [data, form.skills],
  );
  const isOwned = useMemo(
    () => (progress.active ? (p: Piece) => progress.isOwned(p.href) : undefined),
    [progress],
  );
  const editorWeaponIcon = build.hunterType === "Gunner" ? "heavy-bowgun" : "great-sword";

  /** The saved set the editor holds, if it was opened from (or saved to) "My sets". */
  const [savedId, setSavedId] = useState<string | null>(null);
  /** Where the editor's set came from, for its title. */
  const [origin, setOrigin] = useState<Origin>("new");
  const [savedSets, setSavedSets] = useState<SavedSet[]>([]);
  const { toast } = useToast();
  const { ids, error: idsError } = useEquipmentIds();
  const tables = useMemo(() => (data && ids ? buildCodecTables(data, ids) : null), [data, ids]);

  const openInEditor = useCallback(
    (next: BuildSet, from: { savedId?: string; origin?: Origin; warnings?: string[] } = {}) => {
      setBuild(next);
      setForm((f) => ({ ...f, hunterType: next.hunterType, sex: next.sex }));
      setSavedId(from.savedId ?? null);
      setOrigin(from.origin ?? "new");
      setOpenWarnings(from.warnings ?? []);
      setView("editor");
    },
    [],
  );

  const editBuild = (next: BuildSet) => {
    setBuild(next);
    setOpenWarnings([]);
  };

  /** Open a share code (a link or a saved set) in the editor. */
  const openCode = useCallback(
    (code: string, from: { savedId?: string; origin?: Origin } = {}) => {
      if (!tables) return;
      const r = decodeSet(code, tables);
      if (!r.ok) {
        setOpenWarnings([describeDecodeError(r.error)]);
        setView("editor");
        return;
      }
      const warnings =
        r.dropped.length > 0
          ? [
              `Left out ${r.dropped.map(describeDropped).join(", ")}: not in this version of the site.`,
            ]
          : [];
      openInEditor(r.set, { ...from, warnings });
    },
    [tables, openInEditor],
  );

  // On load: a shared link (?s=) wins over everything stored; otherwise the
  // set left in the editor this session. Saved sets are only read here.
  const opened = useRef(false);
  useEffect(() => {
    setSavedSets(readSavedSets());
  }, []);
  useEffect(() => {
    if (opened.current || !restored) return;
    const code = new URLSearchParams(window.location.search).get(SHARE_PARAM);
    if (code !== null && idsError) {
      opened.current = true;
      setOpenWarnings(["Couldn't load the equipment IDs to open this link. Try again online."]);
      setView("editor");
      return;
    }
    if (!tables) return;
    opened.current = true;
    if (code !== null) {
      openCode(code, { origin: "link" });
      // From here the editor's set is kept as the draft, so a reload doesn't
      // bring the link's set back over the player's edits.
      const url = new URL(window.location.href);
      url.searchParams.delete(SHARE_PARAM);
      window.history.replaceState(window.history.state, "", url);
      return;
    }
    const draft = readDraft();
    const r = draft ? decodeSet(draft.code, tables) : null;
    if (draft && r?.ok) {
      setBuild(r.set);
      setForm((f) => ({ ...f, hunterType: r.set.hunterType, sex: r.set.sex }));
      setSavedId(draft.savedId ?? null);
      setOrigin(draft.origin ?? "new");
      if (r.set.pieces.some(Boolean) || r.set.decorations.length > 0) setView("editor");
    }
  }, [tables, idsError, restored, openCode]);

  // Keep the editor's set for reloads and client-side navigation.
  const code = useMemo(() => (tables ? encodeSet(build, tables) : null), [build, tables]);
  useEffect(() => {
    if (opened.current && code) writeDraft({ code, savedId: savedId ?? undefined, origin });
  }, [code, savedId, origin]);

  const storeSets = (next: SavedSet[], done?: string) => {
    setSavedSets(next);
    if (writeSavedSets(next)) {
      if (done) toast({ id: "set-builder-saved", message: done, duration: 3000 });
    } else {
      toast({
        id: "set-builder-saved",
        title: "Couldn't save",
        message:
          "Your browser's storage is full or blocked. Sets are kept until you leave the page.",
        duration: null,
      });
    }
  };

  const savedSet = savedSets.find((s) => s.id === savedId) ?? null;
  const saveBuild = (asNew: boolean) => {
    if (!code) return;
    if (savedSet && !asNew) {
      storeSets(updateSet(savedSets, savedSet.id, { code }), `Saved ${savedSet.name}.`);
      return;
    }
    const [next, added] = addSet(savedSets, nextSetName(savedSets), code);
    setSavedId(added.id);
    storeSets(next, `Saved as ${added.name}. Rename it in My sets.`);
  };

  const share = async () => {
    if (!code) return;
    const url = new URL("/set-builder/", window.location.origin);
    url.searchParams.set(SHARE_PARAM, code);
    try {
      await navigator.clipboard.writeText(url.href);
      toast({ id: "set-builder-share", title: "Link copied", message: url.href });
    } catch {
      toast({
        id: "set-builder-share",
        title: "Copy this link",
        message: url.href,
        duration: null,
      });
    }
  };

  const deleteSaved = (id: string) => {
    const gone = savedSets.find((s) => s.id === id);
    const before = savedSets;
    storeSets(deleteSet(savedSets, id));
    if (id === savedId) setSavedId(null);
    if (gone) {
      toast({
        id: "set-builder-deleted",
        message: `Deleted ${gone.name}.`,
        actions: [{ label: "Undo", onClick: () => storeSets(before) }],
      });
    }
  };

  const editorTitle = (
    <div className="flex flex-wrap items-center gap-[0.8rem]">
      <span className="min-w-0 flex-[1_1_20rem] truncate">
        <PanelTitle>{savedSet ? savedSet.name : ORIGIN_TITLES[origin]}</PanelTitle>
      </span>
      <div className={ui.actions}>
        <button
          type="button"
          className={ui.button}
          disabled={!code}
          onClick={() => saveBuild(false)}
        >
          Save
        </button>
        {savedSet && (
          <button
            type="button"
            className={ui.button}
            disabled={!code}
            onClick={() => saveBuild(true)}
          >
            Save as new
          </button>
        )}
        <button type="button" className={ui.button} disabled={!code} onClick={share}>
          Share
        </button>
        <button
          type="button"
          className={ui.buttonSecondary}
          onClick={() => openInEditor(emptyBuild(form.hunterType, form.sex, build.weaponSlots))}
        >
          New
        </button>
      </div>
    </div>
  );

  // Whether the form asks for something other than the results show.
  const asked = queryFor(form);
  const stale = !!asked && (!searched || !sameQuery(asked, searched));
  const [sheet, setSheet] = useState<"skills" | "options" | null>(null);
  const closeSheet = useCallback(() => setSheet(null), []);
  const searchFromSheet = () => {
    setSheet(null);
    runSearch();
  };

  let message: React.ReactNode = null;
  if (loadError) message = <p className={ui.error}>Couldn&apos;t load the armor data.</p>;
  else if (!data) message = <Loading className={ui.note}>Loading armor…</Loading>;
  else if (error) message = <p className={ui.error}>{error}</p>;
  else if (searching) message = <Loading className={ui.note}>Searching… {found || ""}</Loading>;
  else if (!result)
    message = (
      <>
        <p className={ui.note}>
          Add the skills you want, then search: every armor set with decorations that activates
          them. The best sets come first: by defence, or by what you sort by.
        </p>
        {form.skills.length === 0 && (
          <button type="button" className={primaryButton} onClick={() => setSheet("skills")}>
            Add skills
          </button>
        )}
      </>
    );
  else if (sets.length === 0)
    message = (
      <p className={ui.note}>
        No set activates all of these skills. Try fewer skills, a higher rank, more weapon slots,
        allowing bad skills
        {searched?.lockPieces?.length ? ", unlocking pieces" : ""}
        {searched?.excludePieces?.length ? ", removing excluded pieces" : ""}
        {searched?.progress ? ", or ignoring your quest progress" : ""}.
      </p>
    );

  const searchFooter = (
    <button
      type="button"
      className={primaryButton}
      disabled={!data || form.skills.length === 0}
      onClick={searchFromSheet}
    >
      Search
    </button>
  );

  return (
    <>
      {/* One column on phones; from 900px up the skills and options sit
          beside the results, which get the room. */}
      <div className="mx-auto flex w-full max-w-[64rem] flex-col gap-[1.3rem] pb-[1.6rem] min-[900px]:grid min-[900px]:max-w-[120rem] min-[900px]:grid-cols-[34rem_minmax(0,1fr)] min-[900px]:grid-rows-[auto_auto_1fr] min-[900px]:items-start min-[900px]:pt-[1.6rem] wide:grid-cols-[40rem_minmax(0,1fr)]">
        <CardBox className="flex-none min-[900px]:col-start-1 min-[900px]:row-start-1">
          <Card className="text-small" bodyClassName="card-py-7 gap-[1.2rem]">
            <div className="flex items-baseline justify-between">
              <PanelTitle>Skills</PanelTitle>
              {form.skills.length > 0 && (
                <button
                  type="button"
                  className="cursor-pointer border-none bg-transparent p-0 font-[inherit] text-fine text-white/50 hover:text-white focus-visible:text-white"
                  onClick={() => update("skills", [])}
                >
                  Clear
                </button>
              )}
            </div>
            <SkillChips
              value={form.skills}
              onRemove={(name) =>
                update(
                  "skills",
                  form.skills.filter((v) => v !== name),
                )
              }
              onAdd={() => setSheet("skills")}
              addLabel={form.skills.length ? "+ Skill" : "+ Add the skills you want"}
            />
            <button
              type="button"
              className={`${pressable} flex min-h-[4.8rem] w-full items-center justify-between gap-[1rem] border-t border-white/15 pt-[0.8rem] text-small`}
              aria-label="Options: hunter, rank, weapon slots, sort"
              onClick={() => setSheet("options")}
            >
              <OptionsSummary form={form} ownedOnly={ownedOnly} />
              <span className="flex-none text-white/50" aria-hidden="true">
                Options ›
              </span>
            </button>
          </Card>
        </CardBox>

        <CardBox className="flex-none min-[900px]:col-start-2 min-[900px]:row-span-3 min-[900px]:row-start-1">
          <Card className="text-small" bodyClassName="card-py-7 gap-[1.3rem]">
            <Tabs
              label="Set builder"
              active={view}
              onChange={(id) => setView(id as View)}
              tabs={[
                {
                  id: "results",
                  label: "Results",
                  content: set ? (
                    <div className="flex flex-col gap-[1.3rem]">
                      <ResultView
                        set={set}
                        index={index}
                        count={sets.length}
                        onStep={step}
                        weaponSlots={searched?.weaponSlots ?? 0}
                        hunterType={searched?.hunterType ?? form.hunterType}
                        sort={searched?.sort}
                        wanted={searched?.skills ?? []}
                        actions={pieceActions}
                        action={
                          <button
                            type="button"
                            className="m-0 flex size-[3.4rem] cursor-pointer items-center justify-center border-0 bg-transparent p-0 transition-[filter] duration-100 ease-[ease] hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-white focus-visible:brightness-125 focus-visible:outline-solid"
                            aria-label="Edit this set"
                            title="Edit this set"
                            onClick={() =>
                              searched &&
                              openInEditor(buildFromResult(set, searched), { origin: "result" })
                            }
                          >
                            <Icon type="item-37" className="mr-0" alt="" />
                          </button>
                        }
                      >
                        {result?.timedOut && (
                          <p className={ui.note}>
                            The search stopped early: better sets may exist.
                          </p>
                        )}
                      </ResultView>
                      {searching && message}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-[1.3rem]">{message}</div>
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
                          title={editorTitle}
                        />
                      ) : (
                        message
                      )}
                    </>
                  ),
                },
                {
                  id: "sets",
                  label: "My sets",
                  content: (
                    <MySets
                      sets={savedSets}
                      data={data}
                      tables={tables}
                      openId={savedId}
                      onOpen={(saved) => openCode(saved.code, { savedId: saved.id })}
                      onRename={(id, name) => storeSets(updateSet(savedSets, id, { name }))}
                      onDuplicate={(id) => storeSets(duplicateSet(savedSets, id))}
                      onDelete={deleteSaved}
                    />
                  ),
                },
              ]}
            />
          </Card>
        </CardBox>

        <SearchBar
          searching={searching}
          found={found}
          stale={stale}
          hasResult={!!result}
          skillCount={form.skills.length}
          ready={!!data}
          onSearch={() => runSearch()}
          onCancel={cancel}
        />
      </div>

      <Sheet
        open={sheet === "skills"}
        onClose={closeSheet}
        title={`Skills${form.skills.length ? ` (${form.skills.length})` : ""}`}
        tall
        footer={searchFooter}
      >
        <SkillBrowser skills={skills} value={form.skills} onChange={(v) => update("skills", v)} />
      </Sheet>

      <Sheet open={sheet === "options"} onClose={closeSheet} title="Options" footer={searchFooter}>
        <SearchOptions
          form={form}
          update={update}
          questProgress={questProgress}
          canOwnedOnly={progress.active}
          piecesOf={piecesOf}
        />
      </Sheet>
    </>
  );
}
