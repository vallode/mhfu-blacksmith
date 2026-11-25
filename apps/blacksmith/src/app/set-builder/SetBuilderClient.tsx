"use client";

/**
 * Set builder: an armor set search after Athena's Armor Set Search, laid out
 * for a phone first. The wanted skills are chips at the top, with the
 * hunter's options in a line under them; both open in sheets (SkillBrowser,
 * SearchOptions). The search (in workers, see hooks/useSetSearch.ts) lists
 * the best armor sets with decorations that activate them, by defence or
 * another sort, one at a time (ResultView). Pieces of a result can be
 * locked into every set or excluded from the next search. "Skills within
 * reach" lists the skills that could still be added (SkillReach). Beside the
 * results, the editor builds a set by hand, and My sets keeps saved ones.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Card from "@/components/Card";
import CardBox from "@/components/CardBox";
import Icon from "@/components/Icon";
import Loading from "@/components/Loading";
import Tabs from "@/components/Tabs";
import { useHunterProgress } from "@/context/HunterProgressContext";
import { useGameText, useLocale, useT } from "@/context/LanguageContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useSave } from "@/context/SaveContext";
import { useToast } from "@/context/ToastContext";
import { useSetSearch, type SetSearchError } from "@/hooks/useSetSearch";
import type { ArmorSlot } from "@/lib/constants";
import { useSkillReach } from "@/hooks/useSkillReach";
import { cn } from "@/lib/cn";
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
import {
  hasArmorWord,
  hasSearchLinkParams,
  parseSearchLink,
  withoutSearchLink,
} from "@/lib/search-link";
import { codeFromPath, sharePath } from "@/lib/set-link";
import {
  cantWear,
  resolveWanted,
  sameQuery,
  selectableSkills,
  type Piece,
  type SearchQuery,
} from "@/lib/set-search";
import {
  menuRow,
  pressable,
  primaryButton,
  secondaryButton,
  textButton,
} from "@/styles/set-builder";
import * as ui from "@/styles/settings";
import { PanelTitle } from "./ArmorSetView";
import MySets from "./MySets";
import PieceChips from "./PieceChips";
import ResultView, { type PieceActions } from "./ResultView";
import SearchBar from "./SearchBar";
import SetModel from "./SetModel";
import SetNameForm from "./SetNameForm";
import { LockNote, LockRows, withLock } from "./LockedArmor";
import { PiecePicker } from "./Pickers";
import { DEFAULT_FORM, OptionsSummary, SearchOptions, type Form } from "./SearchOptions";
import SetEditor from "./SetEditor";
import Sheet from "./Sheet";
import { SkillBrowser, SkillChips } from "./SkillPicker";
import SkillReach from "./SkillReach";

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

function readForm(): Form {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null") as
      (Partial<Form> & { ownedOnly?: boolean }) | null;
    const { ownedOnly, ...rest } = saved ?? {};
    const form = { ...DEFAULT_FORM, ...rest };
    // The form used to have an "Owned armor only" switch.
    if (ownedOnly && !rest.ownedArmor) form.ownedArmor = "only";
    return form;
  } catch {
    return DEFAULT_FORM;
  }
}

export default function SetBuilderClient() {
  const t = useT();
  const text = t.setBuilder;
  const game = useGameText();
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

  const ownedArmor = progress.active ? form.ownedArmor : "off";
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
  /**
   * The search the form asks for; null until the data loads or, unless
   * `noSkills`, with no skills.
   */
  const queryFor = (f: Form, noSkills = false): SearchQuery | null => {
    if (!data || (f.skills.length === 0 && !noSkills)) return null;
    const ownedArmor = progress.active ? f.ownedArmor : "off";
    const owned =
      ownedArmor === "off"
        ? undefined
        : data.pieces.filter((p) => progress.isOwned(p.href)).map((p) => p.id);
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
      onlyPieces: ownedArmor === "only" ? owned : undefined,
      preferPieces: ownedArmor === "prefer" ? owned : undefined,
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
  const slotOf = (href: string) => byHref.get(href)?.slot;
  const pieceActions: PieceActions = {
    isLocked: (p) => form.locked.includes(p.href),
    onLock: (p) =>
      changePieces(withLock(form, p.slot, form.locked.includes(p.href) ? null : p, slotOf)),
    onUse: (p) => changePieces(withLock(form, p.slot, p, slotOf)),
    onExclude: (p) =>
      changePieces({
        ...form,
        excluded: form.excluded.includes(p.href) ? form.excluded : [...form.excluded, p.href],
        locked: form.locked.filter((h) => h !== p.href),
      }),
  };

  // Whether the address's search link has been read, and whether it ran a
  // search (which the draft then doesn't take the page from).
  const linkRead = useRef(false);
  const linkSearched = useRef(false);
  // A search link (lib/search-link.ts, from the Discord bot) fills in the
  // search it asks for over the restored form and runs it, once the data is
  // in. Its parameters then leave the address, so a reload keeps the
  // visitor's edits.
  useEffect(() => {
    if (linkRead.current || !restored || !data) return;
    linkRead.current = true;
    const search = window.location.search;
    if (!hasSearchLinkParams(search)) return;
    const url = new URL(window.location.href);
    url.search = withoutSearchLink(search);
    window.history.replaceState(window.history.state, "", url);
    const link = parseSearchLink(search);
    if (!link) return;
    const hunter = { hunterType: link.hunterType ?? form.hunterType, sex: form.sex };
    // Pieces named by a word, only those the hunter could wear: the rest
    // would only crowd the never-used list.
    const named = data.pieces
      .filter((p) => !cantWear(p, hunter) && hasArmorWord(p.name, link.never))
      .map((p) => p.href);
    const next: Form = {
      ...form,
      ...hunter,
      skills: link.skills,
      rank: link.rank ?? form.rank,
      weaponSlots: link.weaponSlots ?? 0,
      locked: link.lock.filter((h) => byHref.has(h)),
      excluded: [...new Set([...link.exclude.filter((h) => byHref.has(h)), ...named])].filter(
        (h) => !link.lock.includes(h),
      ),
    };
    linkSearched.current = true;
    setForm(next);
    runSearch(next);
    // Only once, with the form as restored.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restored, data]);

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
  // The results' piece lists follow the search behind them, not later edits to the form.
  const searchedWanted = useMemo(
    () =>
      data && searched ? [...resolveWanted(data.trees, searched.skills).wanted.keys()] : wanted,
    [data, searched, wanted],
  );
  const isOwned = useMemo(
    () => (progress.active ? (p: Piece) => progress.isOwned(p.href) : undefined),
    [progress],
  );
  const editorWeaponIcon = build.hunterType === "Gunner" ? "heavy-bowgun" : "great-sword";

  /** The saved set the editor holds, if it was opened from (or saved to) "My sets". */
  const [savedId, setSavedId] = useState<string | null>(null);
  /** Whether the editor's title is the set's name field. */
  const [renaming, setRenaming] = useState(false);
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
      setRenaming(false);
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
      const linked = linkSearched.current || hasSearchLinkParams(window.location.search);
      if (!linked && (r.set.pieces.some(Boolean) || r.set.decorations.length > 0)) {
        setView("editor");
      }
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
    if (id === savedId) {
      setSavedId(null);
      setRenaming(false);
    }
    if (gone) {
      toast({
        id: "set-builder-deleted",
        message: text.editor.deleted(gone.name),
        actions: [{ label: text.editor.undo, onClick: () => storeSets(before) }],
      });
    }
  };

  const editorLabel = savedSet ? savedSet.name : (linkName ?? text.editor.origins[origin]);
  const editorTitle = (
    <div className="flex flex-wrap items-center gap-[0.8rem]">
      <div className="flex min-w-0 flex-[1_1_20rem] items-center gap-[0.8rem]">
        {renaming && (savedSet || linkName !== null) ? (
          <SetNameForm
            className="flex-1"
            initial={savedSet?.name ?? linkName ?? ""}
            label={text.editor.nameLabel}
            onSubmit={(name) => {
              if (savedSet) storeSets(updateSet(savedSets, savedSet.id, { name }));
              else setLinkName(name);
              setRenaming(false);
            }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <>
            <span className="min-w-0 truncate">
              <PanelTitle>{editorLabel}</PanelTitle>
            </span>
            {(savedSet || linkName !== null) && (
              <button
                type="button"
                className={textButton}
                aria-label={text.editor.renameLabel(savedSet?.name ?? linkName ?? "")}
                onClick={() => setRenaming(true)}
              >
                {text.editor.rename}
              </button>
            )}
          </>
        )}
      </div>
      <div className={ui.actions}>
        <SetModel
          pieces={build.pieces}
          sex={build.sex === "Female" ? "female" : "male"}
          label={editorLabel}
        />
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
  const [sheet, setSheet] = useState<"skills" | "options" | "reach" | "lock" | null>(null);
  // The order of the sets doesn't change which skills fit.
  const reachQuery = queryFor(form, true);
  const reach = useSkillReach(
    data,
    reachQuery && { ...reachQuery, sort: undefined },
    sheet === "reach",
  );
  /**
   * The lock sheet: the slot it picks a piece for, or (null) the slot rows;
   * and the last slot picked for, whose row has the focus back.
   */
  const [lockSlot, setLockSlot] = useState<ArmorSlot | null>(null);
  const [lastLockSlot, setLastLockSlot] = useState<ArmorSlot | null>(null);
  const lockSlotRef = useRef(lockSlot);
  lockSlotRef.current = lockSlot;
  const openLock = (slot: ArmorSlot | null) => {
    if (slot) setLastLockSlot(slot);
    setLockSlot(slot);
    setSheet("lock");
  };
  const closeSheet = useCallback(() => {
    setSheet(null);
    setLockSlot(null);
    setLastLockSlot(null);
  }, []);
  // In the piece picker, ×, Escape and the dimmed page go back to the slot
  // rows. Stable, so the sheet keeps its focus.
  const closeLock = useCallback(
    () => (lockSlotRef.current ? setLockSlot(null) : closeSheet()),
    [closeSheet],
  );
  const lockPiece = (slot: ArmorSlot, p: Piece | null) =>
    setForm((f) => withLock(f, slot, p, slotOf));
  const lockedPieces = piecesOf(form.locked);
  const lockProps = {
    pieces: lockedPieces,
    onPick: openLock,
    onRemove: (slot: ArmorSlot) => lockPiece(slot, null),
  };
  const searchFromSheet = () => {
    closeSheet();
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
          !!searched?.onlyPieces,
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
                <button type="button" className={textButton} onClick={() => update("skills", [])}>
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
            {/* Taking pieces off marks the results out of date, like the
                skills: Search runs the whole form. */}
            <PieceChips
              text={text.form.locked}
              on
              hrefs={form.locked}
              piecesOf={piecesOf}
              isOff={(p) => !!cantWear(p, form)}
              offNote={text.form.locked.cantWear}
              onRemove={(href) =>
                update(
                  "locked",
                  form.locked.filter((h) => h !== href),
                )
              }
              onClear={() => update("locked", [])}
              onPick={{
                label: (p) =>
                  text.form.locked.pick(t.common.armorSlots[p.slot], game.name("armor", p.name)),
                onClick: (p) => openLock(p.slot),
              }}
              add={{ label: text.form.locked.add, onClick: () => openLock(null) }}
            />
            <PieceChips
              text={text.form.excluded}
              hrefs={form.excluded}
              piecesOf={piecesOf}
              onRemove={(href) =>
                update(
                  "excluded",
                  form.excluded.filter((h) => h !== href),
                )
              }
              onClear={() => update("excluded", [])}
            />
            {/* The dividers sit outside the rows, so each row's glow is
                centred on its text. */}
            <div className="flex flex-col border-t border-white/15">
              <button
                type="button"
                className={cn(pressable, menuRow, "min-h-[4.4rem]")}
                disabled={!data}
                aria-haspopup="dialog"
                onClick={() => setSheet("reach")}
              >
                <span className="min-w-0 truncate text-white">{text.reach.open}</span>
              </button>
              <div aria-hidden="true" className="h-px bg-white/15" />
              <button
                type="button"
                className={cn(pressable, menuRow, "min-h-[4.8rem]")}
                aria-label={text.form.optionsLabel}
                aria-haspopup="dialog"
                onClick={() => setSheet("options")}
              >
                <OptionsSummary form={form} ownedArmor={ownedArmor} />
                <span className="flex-none text-white/50" aria-hidden="true">
                  {text.form.options}
                </span>
              </button>
            </div>
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
                        sex={searched?.sex ?? form.sex}
                        rank={searched?.rank ?? form.rank}
                        progress={searched ? (searched.progress ?? null) : questLimit}
                        pieces={data?.pieces ?? []}
                        wantedTrees={searchedWanted}
                        ownedArmor={
                          searched
                            ? searched.onlyPieces
                              ? "only"
                              : searched.preferPieces
                                ? "prefer"
                                : "off"
                            : ownedArmor
                        }
                        isOwned={isOwned}
                        weaponClass={form.weaponClass}
                        onWeaponClass={(t) => update("weaponClass", t)}
                        sort={searched?.sort}
                        wanted={searched?.skills ?? []}
                        actions={pieceActions}
                        action={
                          <button
                            type="button"
                            className={cn(secondaryButton, "grow gap-[0.8rem]")}
                            aria-label={r.editThis}
                            title={r.editThis}
                            onClick={() =>
                              searched &&
                              openInEditor(buildFromResult(set, searched), { origin: "result" })
                            }
                          >
                            <Icon type="item-37" className="mr-0" alt="" />
                            {/* Just the icon on phones, beside the wishlist button. */}
                            <span className="mobile:sr-only" aria-hidden="true">
                              {r.editThis}
                            </span>
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
                          ownedArmor={ownedArmor}
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
                      saveSets={save?.equipmentSets}
                      saveSex={save?.sex === "Female" ? "Female" : "Male"}
                      saveStale={!!save && save.equipmentSets === undefined}
                      data={data}
                      ids={ids}
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
        open={sheet === "reach"}
        onClose={closeSheet}
        title={text.reach.open}
        tall
        footer={searchFooter}
      >
        <SkillReach
          reach={reach}
          skills={skills}
          value={form.skills}
          onChange={(v) => update("skills", v)}
        />
      </Sheet>

      <Sheet
        open={sheet === "lock"}
        onClose={closeLock}
        title={text.form.locked.title}
        tall={!!lockSlot}
        footer={searchFooter}
      >
        {lockSlot ? (
          <PiecePicker
            slot={lockSlot}
            pieces={data?.pieces ?? []}
            current={lockedPieces.find((p) => p.slot === lockSlot) ?? null}
            hunter={form}
            rank={form.rank}
            wanted={wanted}
            questLimit={questLimit}
            ownedArmor={ownedArmor}
            isOwned={isOwned}
            onPick={(p) => {
              lockPiece(lockSlot, p);
              closeLock();
            }}
            onClose={closeLock}
          />
        ) : (
          <>
            <LockNote />
            <LockRows {...lockProps} focusSlot={lastLockSlot} />
          </>
        )}
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
          canUseOwned={progress.active}
        />
      </Sheet>
    </>
  );
}
