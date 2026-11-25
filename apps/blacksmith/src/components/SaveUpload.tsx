"use client";

/**
 * The hunter section's save file page: link the site to PPSSPP (the hunter
 * then comes from the running game), or pick a save file, then pick a
 * character, like the game's Character Select screen: three slots, "NO DATA"
 * for an empty one, the chosen hunter lit green.
 */
import { useCallback, useRef, useState } from "react";
import { useSaveWorker, type CharacterResult } from "@/hooks/useSaveWorker";
import { useSave } from "@/context/SaveContext";
import { saveFromCharacter } from "@/lib/save-store";
import { useFileSync } from "@/context/FileSyncContext";
import PpssppLink from "@/components/PpssppLink";
import { useLocale, useT } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";
import {
  DetailBody,
  DetailCard,
  DetailHeader,
  DetailName,
  DetailRule,
} from "@/components/DetailPanel";
import { formatPlayTime } from "@/lib/hunter-pages";
import type { SaveData } from "@/lib/save-store";
import Loading from "@/components/Loading";
import * as ui from "@/styles/settings";

const SLOTS = [0, 1, 2];

// One hunter slot, a row like the game's Character Select: the slot number and
// name, with HR, play time and zenny under it. The chosen hunter is lit
// green. Picking it again does nothing: unloading is its own button, under the
// slots, so a stray click can't drop the hunter.
const slotBase =
  "flex w-full flex-col gap-[0.6rem] border-0 bg-transparent px-[1.2rem] py-[1rem] text-left font-[inherit] leading-none text-white";
const slotActive =
  "animate-none bg-[linear-gradient(0.25turn,rgb(3_119_3/0.95),rgb(3_119_3/0.55))]";
const slotName = "flex min-w-0 gap-[1.4rem] text-main [&>:last-child]:truncate";

// Status line under the slots (reading, errors). A div, not a p, so it
// skips Card's one-line paragraph default (.card-copy p in globals.css).
const notice = "py-[1.3rem] text-center text-sub text-white/60";

/** The stored hunter's items, in the order selection saved them (box, then pouch). */
const hunterItems = (c: CharacterResult) => [...c.itemChest, ...c.itemPouch];

/** Whether `character` is the hunter currently stored as active. */
function isActiveHunter(save: SaveData | null, c: CharacterResult): boolean {
  // A save stored before equipment sets were read isn't active for this
  // comparison: the Save file tab asks for it to be loaded again, and picking
  // its slot is how that happens.
  if (!save || save.equipmentSets === undefined || save.name !== c.name) return false;
  const items = hunterItems(c);
  return (
    save.items.length === items.length &&
    save.items.every((s, i) => s.id === items[i].id && s.qty === items[i].qty)
  );
}

interface Hunter {
  name: string;
  sex?: string;
  zenny?: number;
  playTime?: number;
  hunterRank?: number;
}

interface SlotRowProps {
  /** 0-based slot; shown 1-based like the game. Null for the hunter read from PPSSPP, which has none. */
  slot: number | null;
  hunter: Hunter | null;
  active: boolean;
  /** Load this hunter (not called for the loaded one). */
  onSelect?: () => void;
}

function SlotRow({ slot, hunter, active, onSelect }: SlotRowProps) {
  const text = useT().site.hunter;
  const { formatNumber } = useLocale();
  if (!hunter) {
    return (
      <div className={cn(slotBase, "text-white/50")}>
        <span className={slotName}>
          <span>{(slot ?? 0) + 1}</span>
          <span className="uppercase">{text.noData}</span>
        </span>
      </div>
    );
  }
  const meta = [
    hunter.hunterRank !== undefined && text.rankShort(hunter.hunterRank),
    hunter.playTime !== undefined && formatPlayTime(hunter.playTime),
    hunter.sex && (text.sex[hunter.sex] ?? hunter.sex),
    hunter.zenny !== undefined && `${formatNumber(hunter.zenny)}z`,
  ].filter(Boolean);
  return (
    <button
      type="button"
      className={cn(
        slotBase,
        "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white",
        active ? slotActive : "cursor-pointer hover:hover-glow",
      )}
      onClick={active ? undefined : onSelect}
      aria-pressed={active}
    >
      <span className={slotName}>
        {slot !== null && <span>{slot + 1}</span>}
        {hunter.name}
      </span>
      {meta.length > 0 && (
        <span className={cn("text-small text-stat", slot !== null && "pl-[2.8rem]")}>
          {meta.join(" · ")}
        </span>
      )}
      {active && <span className="sr-only">{text.selected}</span>}
    </button>
  );
}

/**
 * Unloads the hunter, after asking: their items, records and progress stop
 * showing across the site until a save is loaded again.
 */
function UnloadHunter({ name, onUnload }: { name: string; onUnload: () => void }) {
  const text = useT().site.hunter;
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <div className={ui.actions}>
        <button type="button" className={ui.buttonSecondary} onClick={() => setAsking(true)}>
          {text.unload}
        </button>
      </div>
    );
  }
  return (
    <div role="alertdialog" aria-label={text.unload} className="flex flex-col gap-[1rem]">
      <div className="text-small text-white">{text.unloadConfirm(name)}</div>
      <div className={ui.actions}>
        <button type="button" className={ui.buttonSecondary} onClick={onUnload}>
          {text.unloadYes}
        </button>
        <button type="button" className={ui.button} autoFocus onClick={() => setAsking(false)}>
          {text.unloadNo}
        </button>
      </div>
    </div>
  );
}

export default function SaveUpload() {
  const t = useT().site;
  const text = t.hunter;
  const { parse, result, error, loading } = useSaveWorker();
  const { save, load, clear } = useSave();
  const fileSync = useFileSync();
  const [isDragOver, setIsDragOver] = useState(false);
  // Whether the parsed result came from the file picker (i.e. the stored
  // handle). Dropped or uploaded files must not overwrite the handle's slot.
  const fromPickerRef = useRef(false);

  const processFile = useCallback(
    async (file: File, fromPicker: boolean) => {
      fromPickerRef.current = fromPicker;
      const buffer = await file.arrayBuffer();
      // The worker detects the region from the keys that decrypt the file.
      parse(buffer, "us");
    },
    [parse],
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file, false);
  };

  const handlePick = useCallback(async () => {
    const picked = await fileSync.pickFile("us");
    if (picked) processFile(picked.file, true);
  }, [fileSync, processFile]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file, false);
  };

  const selectCharacter = useCallback(
    (index: number) => {
      const character = result?.characters[index];
      if (!character) return;
      load(saveFromCharacter(character, result.region, index));
      // Only remember the slot against the stored handle when this result is
      // that handle's file; a dropped/uploaded file may be a different save.
      if (fromPickerRef.current) fileSync.confirmSelection(index, result.region);
    },
    [result, load, fileSync],
  );

  // The hunter read from PPSSPP shows under the link, not in a save's slots.
  const live = save?.source === "ppsspp" ? save : null;
  // With no save open, the stored hunter still shows in its slot.
  const storedSlot = save && !live && !result ? (save.slot ?? 0) : null;

  const loaderCta =
    "block w-full cursor-pointer border border-dashed border-white/35 bg-transparent p-[2.4rem] text-center font-[inherit] text-sub text-white/70 hover:border-white/60 hover:text-white";

  return (
    <DetailCard>
      <DetailHeader>
        <DetailName>{text.pages.save}</DetailName>
      </DetailHeader>
      <DetailBody>
        <h3 className={ui.subheading}>{t.ppssppLink.title}</h3>
        <PpssppLink />
        {live && !result && (
          <>
            <div className="text-small text-white/70">{t.ppssppLink.liveHunter}</div>
            <SlotRow slot={null} hunter={live} active />
            <UnloadHunter key={live.savedAt} name={live.name} onUnload={clear} />
          </>
        )}
        <DetailRule />
        <h3 className={ui.subheading}>{t.saveSync.fileTitle}</h3>
        <div
          className={cn(isDragOver && "outline-2 outline-offset-4 outline-white/40 outline-dashed")}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {fileSync.isSupported ? (
            <button type="button" className={loaderCta} onClick={handlePick}>
              {text.drop}
            </button>
          ) : (
            <label className={loaderCta}>
              <input
                type="file"
                accept=".bin,.BIN"
                className="absolute h-0 w-0 opacity-0"
                onChange={handleFileChange}
              />
              {text.drop}
            </label>
          )}
        </div>

        {loading && <Loading className={cn(notice, "justify-center")}>{text.reading}</Loading>}
        {error && <div className={cn(notice, "text-negative")}>{error}</div>}

        {(result || (save && !live)) && (
          <>
            <DetailRule />
            {result && !save && (
              <div className="text-small text-white/70">{text.pickHunterNote}</div>
            )}
            <div className="flex flex-col gap-[0.4rem]">
              {SLOTS.map((slot) => {
                if (storedSlot === slot && save) {
                  return <SlotRow key={slot} slot={slot} hunter={save} active />;
                }
                const c = result?.characters[slot] ?? null;
                const active = c ? isActiveHunter(save, c) : false;
                return (
                  <SlotRow
                    key={slot}
                    slot={slot}
                    hunter={c}
                    active={active}
                    onSelect={() => selectCharacter(slot)}
                  />
                );
              })}
            </div>
            {save && <UnloadHunter key={save.savedAt} name={save.name} onUnload={clear} />}
          </>
        )}
      </DetailBody>
    </DetailCard>
  );
}
