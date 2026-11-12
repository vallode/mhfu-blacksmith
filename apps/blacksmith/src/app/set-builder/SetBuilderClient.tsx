"use client";

/**
 * Set builder: an armor set search after Athena's Armor Set Search. Pick the
 * skills you want and the hunter's options; the search (in workers, see
 * hooks/useSetSearch.ts) lists the best armor sets with decorations that
 * activate them, by defence or another sort, shown like the game's
 * equipment set screen. Pieces of a result can be locked into every set or
 * excluded from the next search.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import BorderRule from "@/components/BorderRule";
import Card from "@/components/Card";
import CardBox from "@/components/CardBox";
import Icon from "@/components/Icon";
import Tabs from "@/components/Tabs";
import {
  ChoiceRow,
  IconChoiceRow,
  IconChoices,
  SelectorRow,
  ToggleRow,
  type Choice,
  type IconChoice,
} from "@/components/SettingRows";
import { useHunterProgress } from "@/context/HunterProgressContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useSave } from "@/context/SaveContext";
import { useToast } from "@/context/ToastContext";
import { useSetSearch } from "@/hooks/useSetSearch";
import type { ArmorRank } from "@/lib/constants";
import { useEquipmentIds } from "@/lib/equipment";
import { tierLabel } from "@/lib/min-rank";
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
import { cn } from "@/lib/cn";
import { buildFromResult, emptyBuild, MAX_WEAPON_SLOTS, type BuildSet } from "@/lib/set-build";
import {
  buildCodecTables,
  decodeSet,
  describeDecodeError,
  describeDropped,
  encodeSet,
} from "@/lib/set-codec";
import {
  resolveWanted,
  selectableSkills,
  type Piece,
  type SearchQuery,
  type SortKey,
} from "@/lib/set-search";
import * as ui from "@/styles/settings";
import ArmorSetView, { PanelTitle, SetHeader, SetStatus, type PieceActions } from "./ArmorSetView";
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
  sort: SortKey;
  /** Pieces (by page link, which survives data updates) in every set. */
  locked: string[];
  /** Pieces the search leaves out. */
  excluded: string[];
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
  sort: "defence",
  locked: [],
  excluded: [],
};

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

/** The weapon class's mini icon: grey, or green when chosen (as in the nav). */
function classIcon(type: string) {
  return function ClassIcon(checked: boolean) {
    return <Icon type={type} size="mini" nav active={checked} className="mr-0" />;
  };
}
/** Text for a choice button, centred on its letters (ui.centredText). */
function choiceText(text: string, size = "text-main") {
  return function ChoiceText() {
    return <span className={cn(ui.centredText, size)}>{text}</span>;
  };
}
const HUNTER_TYPES: IconChoice<Form["hunterType"]>[] = [
  { value: "Blademaster", label: "Blademaster", icon: classIcon("great-sword") },
  { value: "Gunner", label: "Gunner", icon: classIcon("heavy-bowgun") },
];
const SEXES: IconChoice<Form["sex"]>[] = [
  { value: "Male", label: "Male", icon: choiceText("♂") },
  { value: "Female", label: "Female", icon: choiceText("♀") },
];
const RANKS: IconChoice<ArmorRank>[] = [
  { value: "low-rank", label: "Low Rank", icon: choiceText("LR", "text-sub") },
  { value: "high-rank", label: "High Rank", icon: choiceText("HR", "text-sub") },
  { value: "g-rank", label: "G Rank", icon: choiceText("G", "text-sub") },
];
const SORTS: Choice<SortKey>[] = [
  { value: "defence", label: "Defence" },
  { value: "fire", label: "Fire Res" },
  { value: "water", label: "Water Res" },
  { value: "thunder", label: "Thundr Res" },
  { value: "ice", label: "Ice Res" },
  { value: "dragon", label: "Dragon Res" },
  { value: "slots", label: "Free slots" },
];

/** One glyph of the "-OOO" weapon slots picker. */
const slotButton =
  "flex size-[3.4rem] cursor-pointer items-center justify-center border-none bg-transparent p-0 font-[inherit] text-main leading-none text-shadow-[0.15rem_0.15rem_black] focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-white";
const slotsLabel = (n: number) => (n === 0 ? "No slots" : n === 1 ? "1 slot" : `${n} slots`);

/**
 * Weapon slots as "-OOO": pressing the nth O lights the Os up to it, "-"
 * clears them. A radio group (the arrow keys step the count).
 */
function WeaponSlotsRow({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <ChoiceRow label="Weapon slots" value={slotsLabel(value)}>
      <div
        role="radiogroup"
        aria-label="Weapon slots"
        className="flex flex-none items-center"
        onKeyDown={(event) => {
          const by = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1 }[event.key];
          if (!by) return;
          event.preventDefault();
          const next = Math.min(MAX_WEAPON_SLOTS, Math.max(0, value + by));
          onChange(next);
          event.currentTarget.querySelectorAll<HTMLButtonElement>("[role=radio]")[next]?.focus();
        }}
      >
        {Array.from({ length: MAX_WEAPON_SLOTS + 1 }, (_, n) => {
          const lit = n === 0 ? value === 0 : n <= value;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={n === value}
              aria-label={slotsLabel(n)}
              title={slotsLabel(n)}
              tabIndex={n === value ? 0 : -1}
              className={cn(slotButton, lit ? "text-stat" : "text-white/30 hover:text-white/70")}
              onClick={() => onChange(n)}
            >
              <span className={ui.centredText}>{n === 0 ? "-" : "O"}</span>
            </button>
          );
        })}
      </div>
    </ChoiceRow>
  );
}

/** The hunter the sets are for: weapon class and sex, on one line. */
function HunterRow({
  hunterType,
  sex,
  onHunterType,
  onSex,
}: {
  hunterType: Form["hunterType"];
  sex: Form["sex"];
  onHunterType: (value: Form["hunterType"]) => void;
  onSex: (value: Form["sex"]) => void;
}) {
  return (
    <ChoiceRow label="Hunter" value={`${hunterType}, ${sex.toLowerCase()}`}>
      <IconChoices
        label="Weapon class"
        choices={HUNTER_TYPES}
        value={hunterType}
        onChange={onHunterType}
      />
      <IconChoices label="Sex" choices={SEXES} value={sex} onChange={onSex} />
    </ChoiceRow>
  );
}

/** The locked or excluded pieces, each with × to take it off the list. */
function PieceList({
  label,
  note,
  pieces,
  onRemove,
}: {
  label: string;
  note: string;
  pieces: Piece[];
  onRemove: (href: string) => void;
}) {
  if (pieces.length === 0) return null;
  return (
    <div className="flex flex-col gap-[0.4rem]">
      <span className={ui.statusLabel}>{label}</span>
      <p className={ui.note}>{note}</p>
      <ul className="m-0 flex list-none flex-wrap gap-x-[1.6rem] gap-y-[0.4rem] p-0 text-fine">
        {pieces.map(({ href, name }) => (
          <li key={href} className="flex items-center">
            <Link href={href} className="text-white/80 hover:text-white">
              {name}
            </Link>
            <button
              type="button"
              className="cursor-pointer border-none bg-transparent px-[0.6rem] font-[inherit] text-small leading-none text-white/50 hover:text-negative focus-visible:text-negative"
              aria-label={`Take ${name} off the ${label.toLowerCase()} pieces`}
              onClick={() => onRemove(href)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
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
  const pieceActions: PieceActions = {
    isLocked: (p) => form.locked.includes(p.href),
    onLock: (p) =>
      setForm((f) =>
        f.locked.includes(p.href)
          ? { ...f, locked: f.locked.filter((h) => h !== p.href) }
          : {
              ...f,
              // One locked piece per slot.
              locked: [...f.locked.filter((h) => byHref.get(h)?.slot !== p.slot), p.href],
              excluded: f.excluded.filter((h) => h !== p.href),
            },
      ),
    onExclude: (p) =>
      setForm((f) => ({
        ...f,
        excluded: f.excluded.includes(p.href) ? f.excluded : [...f.excluded, p.href],
        locked: f.locked.filter((h) => h !== p.href),
      })),
  };
  const runSearch = () => {
    if (!data || form.skills.length === 0) return;
    const query: SearchQuery = {
      sort: form.sort,
      lockPieces: pieceIds(form.locked),
      excludePieces: pieceIds(form.excluded),
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

  let message: React.ReactNode = null;
  if (loadError) message = <p className={ui.error}>Couldn&apos;t load the armor data.</p>;
  else if (!data) message = <Loading className={ui.note}>Loading armor…</Loading>;
  else if (error) message = <p className={ui.error}>{error}</p>;
  else if (searching) message = <Loading className={ui.note}>Searching… {found || ""}</Loading>;
  else if (!result)
    message = (
      <p className={ui.note}>
        Add the skills you want, then search. The best sets come first: by defence, or by what you
        sort by.
      </p>
    );
  else if (sets.length === 0)
    message = (
      <p className={ui.note}>
        No set activates all of these skills. Try fewer skills, a higher rank, more weapon slots,
        allowing bad skills
        {searched?.lockPieces?.length ? ", unlocking pieces" : ""}
        {searched?.progress ? ", or ignoring your quest progress" : ""}.
      </p>
    );

  return (
    <>
      {/* Over the skills, where the search is set up. */}
      <header className="flex min-h-[52px] w-full flex-none items-center gap-[1.2rem]">
        <button
          type="submit"
          form="set-search"
          className={ui.button}
          disabled={!data || searching || form.skills.length === 0}
        >
          Find sets
        </button>
        {searching && (
          <button type="button" className={ui.buttonSecondary} onClick={cancel}>
            Cancel
          </button>
        )}
        <p className="m-0 min-w-0 truncate text-fine text-white/60" aria-live="polite">
          {searching
            ? `Searching… ${found || ""}`
            : result
              ? `${sets.length} ${sets.length === 1 ? "set" : "sets"} found`
              : form.skills.length === 0
                ? "Pick the skills you want"
                : `${form.skills.length} ${form.skills.length === 1 ? "skill" : "skills"} picked`}
        </p>
      </header>

      <BorderRule />

      <div className="split-page">
        <CardBox className="max-w-[56rem] mobile:max-w-none mobile:flex-none">
          <Card className="text-small" scroll bodyClassName="gap-[1.3rem] card-py-7">
            <PanelTitle>Skills</PanelTitle>
            <form
              id="set-search"
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
              <HunterRow
                hunterType={form.hunterType}
                sex={form.sex}
                onHunterType={(v) => update("hunterType", v)}
                onSex={(v) => update("sex", v)}
              />
              <IconChoiceRow
                label="Rank"
                choices={RANKS}
                value={form.rank}
                onChange={(v) => update("rank", v)}
              />
              <WeaponSlotsRow value={form.weaponSlots} onChange={(v) => update("weaponSlots", v)} />
              <SelectorRow
                label="Sort by"
                note="Ties go to the higher defence."
                choices={SORTS}
                value={form.sort}
                onChange={(v) => update("sort", v)}
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
              <PieceList
                label="Locked"
                note="Every set uses these, whatever the rank or quest progress."
                pieces={piecesOf(form.locked)}
                onRemove={(href) =>
                  update(
                    "locked",
                    form.locked.filter((h) => h !== href),
                  )
                }
              />
              <PieceList
                label="Excluded"
                note="The search never uses these."
                pieces={piecesOf(form.excluded)}
                onRemove={(href) =>
                  update(
                    "excluded",
                    form.excluded.filter((h) => h !== href),
                  )
                }
              />
            </form>
          </Card>
        </CardBox>

        <CardBox>
          <Card className="text-small" scroll bodyClassName="gap-[1.3rem] card-py-7">
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
                          <SetHeader
                            index={index}
                            count={sets.length}
                            onStep={step}
                            action={
                              <button
                                type="button"
                                className="m-0 flex size-[3.4rem] cursor-pointer items-center justify-center border-0 bg-transparent p-0 transition-[filter] duration-100 ease-[ease] hover:brightness-125 focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-white focus-visible:brightness-125 focus-visible:outline-solid"
                                aria-label="Edit this set"
                                title="Edit this set"
                                onClick={() =>
                                  searched &&
                                  openInEditor(buildFromResult(set, searched), {
                                    origin: "result",
                                  })
                                }
                              >
                                <Icon type="item-37" className="mr-0" alt="" />
                              </button>
                            }
                          />
                          {result?.timedOut && (
                            <p className={ui.note}>
                              The search stopped early: better sets may exist.
                            </p>
                          )}
                          <ArmorSetView
                            set={set}
                            weaponSlots={searched?.weaponSlots ?? 0}
                            weaponIcon={weaponIcon}
                            pieceActions={pieceActions}
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
                      onOpen={(set) => openCode(set.code, { savedId: set.id })}
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
      </div>
    </>
  );
}
