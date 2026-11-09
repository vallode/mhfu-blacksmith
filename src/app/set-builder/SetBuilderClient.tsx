"use client";

/**
 * Set builder: an armor set search after Athena's Armor Set Search. Pick the
 * skills you want and the hunter's options; the search (in a worker, see
 * hooks/useSetSearch.ts) lists every armor set with decorations that
 * activates them, highest defence first, shown like the game's equipment
 * set screen.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import BorderRule from "@/components/BorderRule";
import Card from "@/components/Card";
import Icon from "@/components/Icon";
import Tabs from "@/components/Tabs";
import { SelectorRow, ToggleRow, type Choice } from "@/components/SettingRows";
import { useHunterProgress } from "@/context/HunterProgressContext";
import { useLocale, useT } from "@/context/LanguageContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useSave } from "@/context/SaveContext";
import { useToast } from "@/context/ToastContext";
import { useSetSearch, type SetSearchError } from "@/hooks/useSetSearch";
import { ARMOR_RANKS, type ArmorRank } from "@/lib/constants";
import { useEquipmentIds } from "@/lib/equipment";
import type { Messages } from "@/lib/i18n/messages";
import type { Tier } from "@/lib/min-rank";
import { G_RANK_STAR_OFFSET } from "@/lib/quests";
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
  type DecodeError,
  type DroppedRef,
} from "@/lib/set-codec";
import { resolveWanted, selectableSkills, type Piece, type SearchQuery } from "@/lib/set-search";
import * as ui from "@/styles/settings";
import ArmorSetView, { PanelTitle, SetHeader, SetStatus } from "./ArmorSetView";
import MySets from "./MySets";
import SetEditor from "./SetEditor";
import SkillPicker from "./SkillPicker";
import Loading from "@/components/Loading";

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

/** "High Rank ★7"; G Rank's ★9-★11 are the game's G★1-G★3. */
function tierText(t: Messages, tier: Tier): string {
  const stars = tier.rank === "g-rank" ? tier.stars - G_RANK_STAR_OFFSET : tier.stars;
  return t.setBuilder.tier(t.common.ranks[tier.rank], stars);
}

/** The share link's query parameter: /set-builder/?s=<code>. */
const SHARE_PARAM = "s";

const HUNTER_TYPES: Form["hunterType"][] = ["Blademaster", "Gunner"];
const SEXES: Form["sex"][] = ["Male", "Female"];

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
  const [savedSets, setSavedSets] = useState<SavedSet[]>([]);
  const { toast } = useToast();
  const { ids, error: idsError } = useEquipmentIds();
  const tables = useMemo(() => (data && ids ? buildCodecTables(data, ids) : null), [data, ids]);

  const openInEditor = useCallback(
    (
      next: BuildSet,
      from: { savedId?: string; origin?: Origin; warnings?: OpenWarning[] } = {},
    ) => {
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
        setOpenWarnings([{ kind: "decode", error: r.error }]);
        setView("editor");
        return;
      }
      const warnings: OpenWarning[] =
        r.dropped.length > 0 ? [{ kind: "dropped", dropped: r.dropped }] : [];
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
      setOpenWarnings([{ kind: "ids-unavailable" }]);
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
    const [next, added] = addSet(savedSets, nextSetName(savedSets, text.editor.setName), code);
    setSavedId(added.id);
    storeSets(next, text.editor.savedAs(added.name));
  };

  const share = async () => {
    if (!code) return;
    const url = new URL("/set-builder/", window.location.origin);
    url.searchParams.set(SHARE_PARAM, code);
    try {
      await navigator.clipboard.writeText(url.href);
      toast({ id: "set-builder-share", title: text.editor.linkCopied, message: url.href });
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
        <PanelTitle>{savedSet ? savedSet.name : text.editor.origins[origin]}</PanelTitle>
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

  const hunterChoices: Choice<Form["hunterType"]>[] = HUNTER_TYPES.map((v) => ({
    value: v,
    label: text.hunterTypes[v],
  }));
  const sexChoices: Choice<Form["sex"]>[] = SEXES.map((v) => ({ value: v, label: text.sexes[v] }));
  const rankChoices: Choice<ArmorRank>[] = ARMOR_RANKS.map((r) => ({
    value: r,
    label: t.common.ranks[r],
  }));
  const weaponSlotChoices: Choice<number>[] = [0, 1, 2, 3].map((n) => ({
    value: n,
    label: n === 0 ? text.form.noWeaponSlots : "O".repeat(n).padEnd(3, "-"),
  }));

  const r = text.results;
  let message: React.ReactNode = null;
  if (loadError) message = <p className={ui.error}>{r.loadError}</p>;
  else if (!data) message = <Loading className={ui.note}>{r.loading}</Loading>;
  else if (error) message = <p className={ui.error}>{searchErrorText(t, error)}</p>;
  else if (searching)
    message = (
      <Loading className={ui.note}>{r.searching(found ? formatNumber(found) : "")}</Loading>
    );
  else if (!result) message = <p className={ui.note}>{r.intro}</p>;
  else if (sets.length === 0) message = <p className={ui.note}>{r.noSets(!!searched?.progress)}</p>;

  return (
    <>
      <nav className="flex w-full items-center justify-start mobile:flex-wrap mobile:justify-center">
        <div>
          <Link href="/" aria-label={t.common.back}>
            <Icon type="arrow" nav alt={t.common.back} />
          </Link>
        </div>
        <div className="ml-auto">
          <button
            className="search-trigger flex h-[52px] w-[52px] cursor-pointer items-center border-none bg-transparent p-0 text-white/60 hover:text-white [&>img]:h-full"
            aria-label={text.nav.search}
          >
            <img src="/images/binoculars.png" alt={text.nav.search} decoding="sync" />
          </button>
        </div>
      </nav>

      <BorderRule />

      <div className="split-page">
        <Card className="max-w-[56rem] gap-[1.3rem] overflow-auto py-7 text-small mobile:max-w-none mobile:flex-none">
          <PanelTitle>{text.form.title}</PanelTitle>
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
              label={text.form.hunter}
              choices={hunterChoices}
              value={form.hunterType}
              onChange={(v) => update("hunterType", v)}
            />
            <SelectorRow
              label={text.form.sex}
              choices={sexChoices}
              value={form.sex}
              onChange={(v) => update("sex", v)}
            />
            <SelectorRow
              label={text.form.rank}
              choices={rankChoices}
              value={form.rank}
              onChange={(v) => update("rank", v)}
            />
            <SelectorRow
              label={text.form.weaponSlots}
              choices={weaponSlotChoices}
              value={form.weaponSlots}
              onChange={(v) => update("weaponSlots", v)}
            />
            <ToggleRow
              label={text.form.allowBadSkills}
              note={text.form.allowBadSkillsNote}
              value={form.allowBadSkills}
              onChange={(v) => update("allowBadSkills", v)}
            />
            {questProgress && (
              <ToggleRow
                label={text.form.ignoreProgress}
                note={text.form.ignoreProgressNote(
                  tierText(t, questProgress),
                  <Link className="underline hover:text-white" href="/options/">
                    {t.common.sections.options}
                  </Link>,
                )}
                value={form.ignoreQuestProgress}
                onChange={(v) => update("ignoreQuestProgress", v)}
              />
            )}
            {progress.active && (
              <ToggleRow
                label={text.form.ownedOnly}
                note={text.form.ownedOnlyNote}
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
                {text.form.search}
              </button>
              {searching && (
                <button type="button" className={ui.buttonSecondary} onClick={cancel}>
                  {text.form.cancel}
                </button>
              )}
            </div>
          </form>
        </Card>

        <Card className="gap-[1.3rem] overflow-auto py-7 text-small">
          <Tabs
            label={t.common.sections.setBuilder}
            active={view}
            onChange={(id) => setView(id as View)}
            tabs={[
              {
                id: "results",
                label: text.tabs.results,
                content: (
                  <div className="flex flex-col gap-[1.3rem]">
                    {set ? (
                      <>
                        <SetHeader index={index} count={sets.length} onStep={step} />
                        {result && result.total > sets.length && (
                          <p className={ui.note}>
                            {r.truncated(
                              formatNumber(sets.length),
                              formatNumber(result.total),
                              result.truncated,
                            )}
                          </p>
                        )}
                        {result?.timedOut && <p className={ui.note}>{r.timedOut}</p>}
                        <div className={ui.actions}>
                          <button
                            type="button"
                            className={ui.button}
                            onClick={() =>
                              searched &&
                              openInEditor(buildFromResult(set, searched), { origin: "result" })
                            }
                          >
                            {r.editThis}
                          </button>
                        </div>
                        <ArmorSetView
                          set={set}
                          weaponSlots={searched?.weaponSlots ?? 0}
                          weaponIcon={weaponIcon}
                          status={
                            <>
                              <PanelTitle>{r.status}</PanelTitle>
                              <SetStatus set={set} />
                            </>
                          }
                        />
                      </>
                    ) : (
                      <>
                        <PanelTitle>{t.common.sections.setBuilder}</PanelTitle>
                        {message}
                      </>
                    )}
                    {set && searching && message}
                  </div>
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
                    onOpen={(set) => openCode(set.code, { savedId: set.id })}
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
      </div>
    </>
  );
}
