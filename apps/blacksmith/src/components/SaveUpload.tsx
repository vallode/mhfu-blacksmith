"use client";

/**
 * The hunter page: pick a save file, then pick a character, in the style of
 * the game's Character Select screen. Always three slot cards, "NO DATA" for
 * an empty one, the chosen hunter lit green. Nothing about the hunter's items
 * lives here; the recipes show those.
 */
import { useCallback, useRef, useState } from "react";
import { useSaveWorker, type CharacterResult } from "@/hooks/useSaveWorker";
import { useSave } from "@/context/SaveContext";
import { saveFromCharacter } from "@/lib/save-store";
import { useFileSync } from "@/context/FileSyncContext";
import { useLocale, useT } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";
import Card from "@/components/Card";
import CardBox from "@/components/CardBox";
import type { SaveData } from "@/lib/save-store";
import Loading from "@/components/Loading";

const SLOTS = [0, 1, 2];

// One hunter slot. The card is the frame; this fills it so the whole slot is
// the target, top-aligned so an empty slot's NO DATA sits where a name does.
// Fills the card's body, which starts 6px in, at the frame's outline: the
// padding and height leave out those 6px, so the text sits 2.6rem by 2.4rem
// from the card's edge and the card is 16rem tall.
const slotBase =
  "box-border flex min-h-[14.8rem] w-full flex-col justify-start gap-[0.8rem] border-0 bg-transparent px-[2rem] py-[1.8rem] text-left font-[inherit] leading-none tracking-[0.06em] text-white";

// The chosen hunter, lit like the game's selected slot. Hover keeps the fill
// so clicking again (to deselect) reads as acting on this card.
const slotActive =
  "animate-none bg-[linear-gradient(0.25turn,rgb(3_119_3/0.95),rgb(3_119_3/0.55))]";

const slotName = "flex min-w-0 gap-[1.4rem] text-main [&>:last-child]:truncate";
const slotRow = "flex gap-[1.6rem] text-sub";
const slotLabel = "flex-[0_0_7rem] uppercase";

// Status line under the slots (reading, errors). A div, not a p, so it
// skips Card's one-line paragraph default (.card-copy p in globals.css).
const notice = "py-[1.3rem] text-center text-sub text-white/60";

/** The stored hunter's items, in the order selection saved them (box, then pouch). */
const hunterItems = (c: CharacterResult) => [...c.itemChest, ...c.itemPouch];

/** Whether `character` is the hunter currently stored as active. */
function isActiveHunter(save: SaveData | null, c: CharacterResult): boolean {
  if (!save || save.name !== c.name) return false;
  const items = hunterItems(c);
  return (
    save.items.length === items.length &&
    save.items.every((s, i) => s.id === items[i].id && s.qty === items[i].qty)
  );
}

/** Play time as the game shows it: hours and zero-padded minutes. */
function formatPlayTime(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

interface Hunter {
  name: string;
  sex?: string;
  zenny?: number;
  playTime?: number;
  hunterRank?: number;
}

interface SlotCardProps {
  /** 0-based slot; shown 1-based like the game. */
  slot: number;
  hunter: Hunter | null;
  active: boolean;
  /** Select this hunter, or deselect it when it is the active one. */
  onToggle?: () => void;
}

function SlotCard({ slot, hunter, active, onToggle }: SlotCardProps) {
  const text = useT().site.hunter;
  const { formatNumber } = useLocale();
  if (!hunter) {
    return (
      <CardBox className="flex-none">
        <Card bodyClassName="card-p-0">
          <div className={slotBase}>
            <span className={slotName}>
              <span>{slot + 1}</span>
              <span className="uppercase">{text.noData}</span>
            </span>
          </div>
        </Card>
      </CardBox>
    );
  }
  return (
    <CardBox className="flex-none">
      <Card bodyClassName="card-p-0">
        <button
          type="button"
          className={cn(
            slotBase,
            // 7px in from the body (at the frame's outline), so the ring sits
            // just inside the frame's bands, which cover the body's edge.
            "cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-7 focus-visible:outline-white",
            active ? slotActive : "hover:hover-glow",
          )}
          onClick={onToggle}
          aria-pressed={active}
          title={active ? text.deselect : undefined}
        >
          <span className={slotName}>
            <span>{slot + 1}</span>
            {hunter.name}
          </span>
          {(hunter.playTime !== undefined || hunter.sex) && (
            <span className={slotRow}>
              {hunter.playTime !== undefined && (
                <>
                  <span className={slotLabel}>{text.time}</span>
                  <span>{formatPlayTime(hunter.playTime)}</span>
                </>
              )}
              {hunter.sex && (
                <span className="uppercase">{text.sex[hunter.sex] ?? hunter.sex}</span>
              )}
            </span>
          )}
          {hunter.hunterRank !== undefined && (
            <span className={slotRow}>
              <span className={slotLabel}>{text.rank}</span>
              <span>{hunter.hunterRank}</span>
            </span>
          )}
          {hunter.zenny !== undefined && (
            <span className={slotRow}>
              <span className={slotLabel}>{text.money}</span>
              <span>{formatNumber(hunter.zenny)}z</span>
            </span>
          )}
          {active && <span className="sr-only">{text.selected}</span>}
        </button>
      </Card>
    </CardBox>
  );
}

export default function SaveUpload() {
  const text = useT().site.hunter;
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

  // With no save open, the stored hunter still shows in its slot.
  const storedSlot = save && !result ? (save.slot ?? 0) : null;

  const loaderCta =
    "block w-full cursor-pointer border border-dashed border-white/35 bg-transparent p-[2.4rem] text-center font-[inherit] text-sub text-white/70 hover:border-white/60 hover:text-white";

  return (
    // Slots take the game's third of the width; the loader has the rest. On a
    // phone it's one column with the loader first, above the three slots.
    <div className="grid w-full max-w-[130rem] grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-[1.3rem] mobile:grid-cols-1">
      <div className="flex min-w-0 flex-col gap-[1.3rem]">
        {SLOTS.map((slot) => {
          if (storedSlot === slot && save) {
            return <SlotCard key={slot} slot={slot} hunter={save} active onToggle={clear} />;
          }
          const c = result?.characters[slot] ?? null;
          const active = c ? isActiveHunter(save, c) : false;
          return (
            <SlotCard
              key={slot}
              slot={slot}
              hunter={c}
              active={active}
              onToggle={() => (active ? clear() : selectCharacter(slot))}
            />
          );
        })}

        {loading && <Loading className={cn(notice, "justify-center")}>{text.reading}</Loading>}
        {error && <div className={cn(notice, "text-negative")}>{error}</div>}
      </div>

      <CardBox className="min-w-0 flex-none self-start mobile:-order-1">
        <Card
          className={cn(
            isDragOver && "outline-2 -outline-offset-4 outline-white/40 outline-dashed",
          )}
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
        </Card>
      </CardBox>
    </div>
  );
}
