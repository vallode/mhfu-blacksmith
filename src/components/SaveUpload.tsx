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
import { cn } from "@/lib/cn";
import Card from "@/components/Card";
import type { SaveData } from "@/lib/save-store";
import styles from "@/styles/hunter.module.scss";

const SLOTS = [0, 1, 2];

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
  if (!hunter) {
    return (
      <Card className={cn(styles.slot, "p-0")}>
        <div className={cn(styles["slot__button"], styles["slot__button--empty"])}>
          <span className={styles["slot__name"]}>
            <span>{slot + 1}</span>
            <span className={styles["slot__nodata"]}>No data</span>
          </span>
        </div>
      </Card>
    );
  }
  return (
    <Card className={cn(styles.slot, "p-0")}>
      <button
        type="button"
        className={cn(styles["slot__button"], active && styles["slot__button--active"])}
        onClick={onToggle}
        aria-pressed={active}
        title={active ? "Deselect this hunter" : undefined}
      >
        <span className={styles["slot__name"]}>
          <span>{slot + 1}</span>
          {hunter.name}
        </span>
        {(hunter.playTime !== undefined || hunter.sex) && (
          <span className={styles["slot__row"]}>
            {hunter.playTime !== undefined && (
              <>
                <span className={styles["slot__label"]}>Time</span>
                <span>{formatPlayTime(hunter.playTime)}</span>
              </>
            )}
            {hunter.sex && <span className={styles["slot__sex"]}>{hunter.sex}</span>}
          </span>
        )}
        {hunter.zenny !== undefined && (
          <span className={styles["slot__row"]}>
            <span className={styles["slot__label"]}>Money</span>
            <span>{hunter.zenny.toLocaleString()}z</span>
          </span>
        )}
        {active && <span className="sr-only"> (selected)</span>}
      </button>
    </Card>
  );
}

export default function SaveUpload() {
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
    [parse]
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
    [result, load, fileSync]
  );

  // With no save open, the stored hunter still shows in its slot.
  const storedSlot = save && !result ? (save.slot ?? 0) : null;

  return (
    <div className={styles.select}>
      <div className={styles.slots}>
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

        {loading && <p className={styles.notice}>Reading save file…</p>}
        {error && <p className={cn(styles.notice, styles["notice--error"])}>{error}</p>}
      </div>

      <Card
        className={cn(styles.loader, isDragOver && styles["loader--drag-over"])}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        {fileSync.isSupported ? (
          <button type="button" className={styles["loader__cta"]} onClick={handlePick}>
            Drop MHP2NDG.BIN here or click to browse
          </button>
        ) : (
          <label className={styles["loader__cta"]}>
            <input
              type="file"
              accept=".bin,.BIN"
              className={styles["loader__input"]}
              onChange={handleFileChange}
            />
            Drop MHP2NDG.BIN here or click to browse
          </label>
        )}
      </Card>
    </div>
  );
}
