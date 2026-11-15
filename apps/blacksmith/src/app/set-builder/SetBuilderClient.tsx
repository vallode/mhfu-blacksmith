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
import { useLocale, useT } from "@/context/LanguageContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useSave } from "@/context/SaveContext";
import { useToast } from "@/context/ToastContext";
import { useSetSearch, type SetSearchError } from "@/hooks/useSetSearch";
import { useEquipmentIds } from "@/lib/equipment";
import type { Messages } from "@/lib/i18n/messages";
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
  encodeSet,
  SHARE_PARAM,
  type DecodeError,
  type DroppedRef,
} from "@/lib/set-codec";
import { codeFromPath, sharePath } from "@/lib/set-link";
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

/** A problem opening a set (a share link or a saved set), shown above it in the editor. */
type OpenWarning =
  | { kind: "decode"; error: DecodeError }
  | { kind: "dropped"; dropped: DroppedRef[] }
  | { kind: "ids-unavailable" };

function openWarningText(t: Messages, w: OpenWarning): string {
  const text = t.setBuilder.open;
  if (w.kind === "ids-unavailable") return text.idsUnavailable;
  if (w.kind === "dropped") {
    const list = w.dropped.map((d) =>
      d.kind === "piece"
        ? text.droppedPiece(t.common.armorSlots[d.slot], d.gameId)
        : text.droppedDecoration(d.itemId, !d.bin),
    );
    return text.dropped(list.join(", "), list.length);
  }
  switch (w.error.kind) {
    case "version":
      return text.newerVersion(w.error.version);
    case "malformed":
      return text.malformed;
    case "unknown-ids":
      return text.unknownIds;
  }
}

function searchErrorText(t: Messages, e: SetSearchError): string {
  const text = t.setBuilder.results.errors;
  if (e.kind === "not-loaded") return text.notLoaded;
  if (e.kind === "failed") return text.failed(e.detail);
  return text.crashed;
}

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
  const t = useT();
  const text = t.setBuilder;
  const { formatNumber } = useLocale();
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
  const [openWarnings, setOpenWarnings] = useState<OpenWarning[]>([]);
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
  /** The name a shared link gave its set, for the editor's title and saving it. */
  const [linkName, setLinkName] = useState<string | null>(null);
  const [savedSets, setSavedSets] = useState<SavedSet[]>([]);
  const { toast } = useToast();
  const { ids, error: idsError } = useEquipmentIds();
  const tables = useMemo(() => (data && ids ? buildCodecTables(data, ids) : null), [data, ids]);

  const openInEditor = useCallback(
    (
      next: BuildSet,
      from: { savedId?: string; origin?: Origin; name?: string; warnings?: OpenWarning[] } = {},
    ) => {
      setBuild(next);
      setForm((f) => ({ ...f, hunterType: next.hunterType, sex: next.sex }));
      setSavedId(from.savedId ?? null);
      setOrigin(from.origin ?? "new");
      setLinkName(from.name ?? null);
      setOpenWarnings(from.warnings ?? []);
      setView("editor");
    },
    [],
  );

  const editBuild = (next: BuildSet) => {
    setBuild(next);
    setOpenWarnings([]);
  };

  /** Open a share code (a link or a saved set) in the editor; the decoded code, if it opened. */
  const openCode = useCallback(
    (code: string, from: { savedId?: string; origin?: Origin } = {}) => {
      if (!tables) return null;
      const r = decodeSet(code, tables);
      if (!r.ok) {
        setOpenWarnings([{ kind: "decode", error: r.error }]);
        setView("editor");
        return null;
      }
      const warnings: OpenWarning[] =
        r.dropped.length > 0 ? [{ kind: "dropped", dropped: r.dropped }] : [];
      openInEditor(r.set, { ...from, name: r.name, warnings });
      return r;
    },
    [tables, openInEditor],
  );

  // On load: a share link (/sets/<code>/, or the older ?s=) wins over
  // everything stored; otherwise the set left in the editor this session.
  // Saved sets are only read here.
  const opened = useRef(false);
  useEffect(() => {
    setSavedSets(readSavedSets());
  }, []);
  useEffect(() => {
    if (opened.current || !restored) return;
    const code =
      codeFromPath(window.location.pathname) ??
      new URLSearchParams(window.location.search).get(SHARE_PARAM);
    if (code !== null && idsError) {
      opened.current = true;
      setOpenWarnings([{ kind: "ids-unavailable" }]);
      setView("editor");
      return;
    }
    if (!tables) return;
    opened.current = true;
    if (code !== null) {
      const r = openCode(code, { origin: "link" });
      // From here the editor's set is kept as the draft, so a reload doesn't
      // bring the link's set back over the player's edits. It's kept before
      // the address changes: in the offline page (src/app/offline) the change
      // makes Next load the cached set builder, which opens the draft.
      if (r) writeDraft({ code: r.canonical, origin: "link", name: r.name });
      const url = new URL(window.location.href);
      url.pathname = "/set-builder/";
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
      setLinkName(typeof draft.name === "string" ? draft.name : null);
      if (r.set.pieces.some(Boolean) || r.set.decorations.length > 0) setView("editor");
    }
  }, [tables, idsError, restored, openCode]);

  // Keep the editor's set for reloads and client-side navigation.
  const code = useMemo(() => (tables ? encodeSet(build, tables) : null), [build, tables]);
  useEffect(() => {
    if (opened.current && code) {
      writeDraft({ code, savedId: savedId ?? undefined, origin, name: linkName ?? undefined });
    }
  }, [code, savedId, origin, linkName]);

  const storeSets = (next: SavedSet[], done?: string) => {
    setSavedSets(next);
    if (writeSavedSets(next)) {
      if (done) toast({ id: "set-builder-saved", message: done, duration: 3000 });
    } else {
      toast({
        id: "set-builder-saved",
        title: text.editor.saveFailedTitle,
        message: text.editor.saveFailed,
        duration: null,
      });
    }
  };

  const savedSet = savedSets.find((s) => s.id === savedId) ?? null;
  const saveBuild = (asNew: boolean) => {
    if (!code) return;
    if (savedSet && !asNew) {
      storeSets(updateSet(savedSets, savedSet.id, { code }), text.editor.saved(savedSet.name));
      return;
    }
    // A shared set keeps the name it was shared with.
    const name = !savedSet && linkName ? linkName : nextSetName(savedSets, text.editor.setName);
    const [next, added] = addSet(savedSets, name, code);
    setSavedId(added.id);
    // From here the saved set's name is the one shown and shared.
    setLinkName(null);
    storeSets(next, text.editor.savedAs(added.name));
  };

  const share = async () => {
    if (!code || !tables) return;
    // The link carries the set's name, which its link preview is titled with
    // and its address ends with.
    const name = savedSet?.name ?? linkName ?? undefined;
    const url = new URL(sharePath(encodeSet(build, tables, name), name), window.location.origin);
    try {
      await navigator.clipboard.writeText(url.href);
      toast({
        id: "set-builder-share",
        title: text.editor.linkCopied,
        message: text.editor.linkCopiedNote,
      });
    } catch {
      toast({
        id: "set-builder-share",
        title: text.editor.copyLink,
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
        message: text.editor.deleted(gone.name),
        actions: [{ label: text.editor.undo, onClick: () => storeSets(before) }],
      });
    }
  };

  const editorTitle = (
    <div className="flex flex-wrap items-center gap-[0.8rem]">
      <span className="min-w-0 flex-[1_1_20rem] truncate">
        <PanelTitle>
          {savedSet ? savedSet.name : (linkName ?? text.editor.origins[origin])}
        </PanelTitle>
      </span>
      <div className={ui.actions}>
        <button
          type="button"
          className={ui.button}
          disabled={!code}
          onClick={() => saveBuild(false)}
        >
          {text.editor.save}
        </button>
        {savedSet && (
          <button
            type="button"
            className={ui.button}
            disabled={!code}
            onClick={() => saveBuild(true)}
          >
            {text.editor.saveAsNew}
          </button>
        )}
        <button type="button" className={ui.button} disabled={!code} onClick={share}>
          {text.editor.share}
        </button>
        <button
          type="button"
          className={ui.buttonSecondary}
          onClick={() => openInEditor(emptyBuild(form.hunterType, form.sex, build.weaponSlots))}
        >
          {text.editor.new}
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

  const r = text.results;
  let message: React.ReactNode = null;
  if (loadError) message = <p className={ui.error}>{r.loadError}</p>;
  else if (!data) message = <Loading className={ui.note}>{r.loading}</Loading>;
  else if (error) message = <p className={ui.error}>{searchErrorText(t, error)}</p>;
  else if (searching)
    message = (
      <Loading className={ui.note}>{r.searching(found ? formatNumber(found) : "")}</Loading>
    );
  else if (!result)
    message = (
      <>
        <p className={ui.note}>{r.intro}</p>
        {form.skills.length === 0 && (
          <button type="button" className={primaryButton} onClick={() => setSheet("skills")}>
            {r.addSkills}
          </button>
        )}
      </>
    );
  else if (sets.length === 0)
    message = (
      <p className={ui.note}>
        {r.noSets(
          !!searched?.progress,
          !!searched?.lockPieces?.length,
          !!searched?.excludePieces?.length,
        )}
      </p>
    );

  const searchFooter = (
    <button
      type="button"
      className={primaryButton}
      disabled={!data || form.skills.length === 0}
      onClick={searchFromSheet}
    >
      {text.form.search}
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
              <PanelTitle>{text.form.title}</PanelTitle>
              {form.skills.length > 0 && (
                <button
                  type="button"
                  className="cursor-pointer border-none bg-transparent p-0 font-[inherit] text-fine text-white/50 hover:text-white focus-visible:text-white"
                  onClick={() => update("skills", [])}
                >
                  {text.form.clear}
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
              addLabel={form.skills.length ? text.form.addMore : text.form.addFirst}
            />
            <button
              type="button"
              className={`${pressable} flex min-h-[4.8rem] w-full items-center justify-between gap-[1rem] border-t border-white/15 pt-[0.8rem] text-small`}
              aria-label={text.form.optionsLabel}
              onClick={() => setSheet("options")}
            >
              <OptionsSummary form={form} ownedOnly={ownedOnly} />
              <span className="flex-none text-white/50" aria-hidden="true">
                {text.form.options} ›
              </span>
            </button>
          </Card>
        </CardBox>

        <CardBox className="flex-none min-[900px]:col-start-2 min-[900px]:row-span-3 min-[900px]:row-start-1">
          <Card className="text-small" bodyClassName="card-py-7 gap-[1.3rem]">
            <Tabs
              label={t.common.sections.setBuilder}
              active={view}
              onChange={(id) => setView(id as View)}
              tabs={[
                {
                  id: "results",
                  label: text.tabs.results,
                  content: set ? (
                    <div className="flex flex-col gap-[1.3rem]">
                      <ResultView
                        set={set}
                        index={index}
                        count={sets.length}
                        onStep={step}
                        weaponSlots={searched?.weaponSlots ?? 0}
                        hunterType={searched?.hunterType ?? form.hunterType}
                        rank={searched?.rank ?? form.rank}
                        progress={searched ? (searched.progress ?? null) : questLimit}
                        weaponClass={form.weaponClass}
                        onWeaponClass={(t) => update("weaponClass", t)}
                        sort={searched?.sort}
                        wanted={searched?.skills ?? []}
                        actions={pieceActions}
                        action={
                          <button
                            type="button"
                            className="m-0 flex size-[3.4rem] cursor-pointer items-center justify-center border-0 bg-transparent p-0 transition-[filter] duration-100 ease-[ease] hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-white focus-visible:brightness-125 focus-visible:outline-solid"
                            aria-label={r.editThis}
                            title={r.editThis}
                            onClick={() =>
                              searched &&
                              openInEditor(buildFromResult(set, searched), { origin: "result" })
                            }
                          >
                            <Icon type="item-37" className="mr-0" alt="" />
                          </button>
                        }
                      >
                        {result?.timedOut && <p className={ui.note}>{r.timedOut}</p>}
                      </ResultView>
                      {searching && message}
                    </div>
                  ) : (
                    <div className="flex flex-col gap-[1.3rem]">{message}</div>
                  ),
                },
                {
                  id: "editor",
                  label: text.tabs.editor,
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
                          extraWarnings={openWarnings.map((w) => openWarningText(t, w))}
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
                  label: text.tabs.sets,
                  content: (
                    <MySets
                      sets={savedSets}
                      data={data}
                      tables={tables}
                      openId={savedId}
                      onOpen={(saved) => openCode(saved.code, { savedId: saved.id })}
                      onRename={(id, name) => storeSets(updateSet(savedSets, id, { name }))}
                      onDuplicate={(id) =>
                        storeSets(duplicateSet(savedSets, id, text.editor.copyName))
                      }
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
        title={text.form.skillsTitle(form.skills.length)}
        tall
        footer={searchFooter}
      >
        <SkillBrowser skills={skills} value={form.skills} onChange={(v) => update("skills", v)} />
      </Sheet>

      <Sheet
        open={sheet === "options"}
        onClose={closeSheet}
        title={text.form.options}
        footer={searchFooter}
      >
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
