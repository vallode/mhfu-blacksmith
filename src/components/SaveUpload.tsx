"use client";

/**
 * The hunter page: pick a save file, then pick a character, in the style of
 * the game's Character Select screen. One card per hunter slot, the chosen
 * hunter lit green. Nothing about the hunter's items lives here; the recipes
 * show those.
 */
import { useCallback, useRef, useState } from "react";
import { useSaveWorker, type CharacterResult, type Region } from "@/hooks/useSaveWorker";
import { useSave } from "@/context/SaveContext";
import { saveFromCharacter } from "@/lib/save-store";
import { useFileSync } from "@/context/FileSyncContext";
import { cn } from "@/lib/cn";
import Card from "@/components/Card";
import type { SaveData } from "@/lib/save-store";
import styles from "@/styles/hunter.module.scss";

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

interface SlotCardProps {
  /** 1-based slot number, as the game shows it; omitted for a stored hunter whose save isn't open. */
  slot?: number;
  name: string;
  sex?: string;
  zenny?: number;
  playTime?: number;
  active: boolean;
  /** Select this hunter, or deselect it when it is the active one. */
  onToggle: () => void;
}

function SlotCard({ slot, name, sex, zenny, playTime, active, onToggle }: SlotCardProps) {
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
          {slot !== undefined && <span>{slot}</span>}
          {name}
        </span>
        {(playTime !== undefined || sex) && (
          <span className={styles["slot__row"]}>
            {playTime !== undefined && (
              <>
                <span className={styles["slot__label"]}>Time</span>
                <span>{formatPlayTime(playTime)}</span>
              </>
            )}
            {sex && <span className={styles["slot__sex"]}>{sex}</span>}
          </span>
        )}
        {zenny !== undefined && (
          <span className={styles["slot__row"]}>
            <span className={styles["slot__label"]}>Money</span>
            <span>{zenny.toLocaleString()}z</span>
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
  const regionRef = useRef<HTMLSelectElement>(null);
  // Whether the parsed result came from the file picker (i.e. the stored
  // handle). Dropped or uploaded files must not overwrite the handle's slot.
  const fromPickerRef = useRef(false);

  const processFile = useCallback(
    async (file: File, fromPicker: boolean) => {
      fromPickerRef.current = fromPicker;
      const region = (regionRef.current?.value ?? "us") as Region;
      const buffer = await file.arrayBuffer();
      parse(buffer, region);
    },
    [parse]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file, false);
  };

  const handlePick = useCallback(async () => {
    const region = (regionRef.current?.value ?? "us") as Region;
    const picked = await fileSync.pickFile(region);
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
      const region = (regionRef.current?.value ?? "us") as Region;
      load(saveFromCharacter(character, region));
      // Only remember the slot against the stored handle when this result is
      // that handle's file; a dropped/uploaded file may be a different save.
      if (fromPickerRef.current) fileSync.confirmSelection(index, region);
    },
    [result, load, fileSync]
  );

  const characters = result?.characters ?? [];
  const occupied = characters.filter((c): c is CharacterResult => c !== null);
  // The stored hunter, when the save it came from isn't open on this page.
  const storedOnly = save && !occupied.some((c) => isActiveHunter(save, c));

  return (
    <div className={styles.select}>
      <div className={styles.slots}>
        {storedOnly && (
          <SlotCard
            name={save.name}
            sex={save.sex}
            zenny={save.zenny}
            playTime={save.playTime}
            active
            onToggle={clear}
          />
        )}

        {characters.map((c, index) => {
          if (!c) return null;
          const active = isActiveHunter(save, c);
          return (
            <SlotCard
              key={index}
              slot={index + 1}
              name={c.name}
              sex={c.sex}
              zenny={c.zenny}
              playTime={c.playTime}
              active={active}
              onToggle={() => (active ? clear() : selectCharacter(index))}
            />
          );
        })}

        {loading && <p className={styles.notice}>Reading save file…</p>}
        {result && occupied.length === 0 && <p className={styles.notice}>No hunters found in this save.</p>}
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

        <select ref={regionRef} className={styles["loader__region"]} aria-label="Game region">
          <option value="us">US (ULUS-10391)</option>
          <option value="eu">EU (ULES-01213)</option>
          <option value="jp">JP (ULJM-05500)</option>
        </select>

        <p className={styles["loader__note"]}>The file never leaves your device.</p>
      </Card>
    </div>
  );
}
