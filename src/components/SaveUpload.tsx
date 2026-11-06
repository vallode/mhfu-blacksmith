"use client";

import { useCallback, useRef, useState } from "react";
import { useSaveWorker, type CharacterResult, type Region } from "@/hooks/useSaveWorker";
import { useSave } from "@/context/SaveContext";
import { saveFromCharacter } from "@/lib/save-store";
import { useToast } from "@/context/ToastContext";
import { useFileSync } from "@/context/FileSyncContext";
import Card from "@/components/Card";
import type { EquipSlot, SaveData } from "@/lib/save-store";
import styles from "@/styles/hunter.module.scss";

function formatNumber(n: number): string {
  return n.toLocaleString();
}

function formatTimeAgo(ts: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** Equip type codes 5 (melee) and 6 (ranged) are weapons; 0–4 are armor pieces. */
const isWeapon = (slot: EquipSlot) => slot.type >= 5;

/** Zenny, weapon/armor counts and item stack count for a hunter. */
function HunterStats({ zenny, equipment, itemCount }: { zenny?: number; equipment?: EquipSlot[]; itemCount: number }) {
  const weapons = equipment?.filter(isWeapon).length;
  const armor = equipment && equipment.length - (weapons ?? 0);
  const stats: [string, number | undefined][] = [
    ["Zenny", zenny],
    ["Weapons", weapons],
    ["Armor", armor],
    ["Items", itemCount],
  ];
  return (
    <div className={styles["hunter-profile__stats"]}>
      {stats.map(([label, value]) => (
        <div key={label} className={styles["hunter-profile__stat"]}>
          <span className={styles["hunter-profile__label"]}>{label}</span>
          <span className={styles["hunter-profile__value"]}>
            {value === undefined ? "—" : formatNumber(value)}
          </span>
        </div>
      ))}
    </div>
  );
}

const REGION_LABELS: Record<string, string> = { us: "US", eu: "EU", jp: "JP" };

/** The stored hunter's items, in the order "Use hunter" saved them (box, then pouch). */
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

/** The hunter whose items the site currently uses, shown even after a reload. */
function ActiveHunterCard({ save, onClear }: { save: SaveData; onClear: () => void }) {
  return (
    <Card>
      <div className={styles["hunter-profile"]}>
        <span className={styles["hunter-profile__label"]}>Active hunter</span>
        <div className={styles["hunter-profile__header"]}>
          <span className={styles["hunter-profile__name"]}>{save.name}</span>
          <span className={styles["hunter-profile__sex"]}>
            {REGION_LABELS[save.region] ?? save.region} · selected {formatTimeAgo(save.savedAt)}
          </span>
        </div>
        <p className={styles["save-upload__note"]}>
          Weapon and armor recipes show how many of each material this hunter owns.
        </p>
        <HunterStats zenny={save.zenny} equipment={save.equipment} itemCount={save.items.length} />
        <button className={styles["hunter-profile__use-btn"]} onClick={onClear}>
          Stop using this hunter
        </button>
      </div>
    </Card>
  );
}

interface CharacterCardProps {
  character: CharacterResult;
  index: number;
  showUseButton: boolean;
  onUse: (index: number) => void;
  /** This hunter is the one currently stored as active. */
  active: boolean;
}

function CharacterCard({ character, index, showUseButton, onUse, active }: CharacterCardProps) {
  return (
    <Card>
      <div className={styles["hunter-profile"]}>
        <div className={styles["hunter-profile__header"]}>
          <span className={styles["hunter-profile__name"]}>{character.name}</span>
          <span className={styles["hunter-profile__sex"]}>{character.sex}</span>
        </div>

        <HunterStats
          zenny={character.zenny}
          equipment={character.equipBox}
          itemCount={character.itemChest.length + character.itemPouch.length}
        />

        {showUseButton && (
          <button
            className={`${styles["hunter-profile__use-btn"]}${active ? ` ${styles["is-active"]}` : ""}`}
            onClick={() => onUse(index)}
            disabled={active}
          >
            {active ? "Active hunter" : `Use hunter ${index + 1}`}
          </button>
        )}
      </div>
    </Card>
  );
}

export default function SaveUpload() {
  const { parse, result, error, loading } = useSaveWorker();
  const { save, load, clear } = useSave();
  const { toast } = useToast();
  const fileSync = useFileSync();
  const [isDragOver, setIsDragOver] = useState(false);
  const regionRef = useRef<HTMLSelectElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
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

  const occupied = result?.characters.filter(Boolean) as CharacterResult[] | undefined;
  const showUseButton = (occupied?.length ?? 0) > 1;

  const selectCharacter = useCallback(
    (index: number) => {
      const character = result?.characters[index];
      if (!character) return;
      const region = (regionRef.current?.value ?? "us") as Region;
      load(saveFromCharacter(character, region));
      toast({
        id: "hunter-selected",
        title: "Hunter selected",
        message: `${character.name} is now your active hunter. Weapon and armor recipes show how many of each material you own.`,
      });
      // Only remember the slot against the stored handle when this result is
      // that handle's file; a dropped/uploaded file may be a different save.
      if (fromPickerRef.current) fileSync.confirmSelection(index, region);
    },
    [result, load, fileSync, toast]
  );

  const singleActive = occupied?.length === 1 && isActiveHunter(save, occupied[0]);

  const handleClear = () => {
    clear();
    toast({
      id: "hunter-selected",
      message: "No active hunter. Recipes show required amounts only.",
    });
  };

  const handleUseSingle = () => {
    if (!occupied || occupied.length !== 1) return;
    selectCharacter(result!.characters.indexOf(occupied[0]));
  };

  return (
    <div className={styles["hunter-page__upload"]}>
      <Card
        className={`${styles["save-upload"]}${isDragOver ? ` ${styles["is-drag-over"]}` : ""}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <p>Hunter Profile</p>

        {fileSync.isSupported ? (
          <button
            type="button"
            className={styles["save-upload__label"]}
            onClick={handlePick}
          >
            <span className={styles["save-upload__cta"]}>
              Drop MHP2NDG.BIN here or click to browse
            </span>
          </button>
        ) : (
          <label className={styles["save-upload__label"]}>
            <input
              ref={inputRef}
              type="file"
              accept=".bin,.BIN"
              className={styles["save-upload__input"]}
              onChange={handleFileChange}
            />
            <span className={styles["save-upload__cta"]}>
              Drop MHP2NDG.BIN here or click to browse
            </span>
          </label>
        )}

        <select ref={regionRef} className={styles["save-upload__region"]}>
          <option value="us">US (ULUS-10391)</option>
          <option value="eu">EU (ULES-01213)</option>
          <option value="jp">JP (ULJM-05500)</option>
        </select>

        <p className={styles["save-upload__note"]}>
          Supports PPSSPP saves (both default and decrypted exports).{" "}
          <em>The file never leaves your device.</em>
        </p>

        {fileSync.isSupported && fileSync.hasHandle && (
          <div className={styles["save-upload__sync"]}>
            <span className={styles["save-upload__sync-status"]}>
              {fileSync.syncing
                ? "Syncing…"
                : fileSync.permission !== "granted"
                  ? "Reconnect needed to keep syncing"
                  : fileSync.lastSynced
                    ? `Synced with ${fileSync.fileName} · ${formatTimeAgo(fileSync.lastSynced)}`
                    : `Connected to ${fileSync.fileName}`}
            </span>
            {fileSync.permission === "granted" ? (
              <button
                type="button"
                className={styles["save-upload__sync-btn"]}
                onClick={() => fileSync.syncNow()}
                disabled={fileSync.syncing}
              >
                Sync now
              </button>
            ) : (
              <button
                type="button"
                className={styles["save-upload__sync-btn"]}
                onClick={() => fileSync.requestReconnect()}
              >
                Reconnect
              </button>
            )}
          </div>
        )}
      </Card>

      <div className={styles["hunter-page__results"]}>
        {save && <ActiveHunterCard save={save} onClear={handleClear} />}

        {loading && (
          <p className={styles["save-upload__notice"]}>Reading save file…</p>
        )}

        {error && (
          <p className={`${styles["save-upload__notice"]} ${styles["save-upload__notice--error"]}`}>
            {error}
          </p>
        )}

        {occupied && occupied.length === 0 && (
          <p className={styles["save-upload__notice"]}>No hunters found in this save.</p>
        )}

        {occupied && occupied.length === 1 && (
          <>
            <CharacterCard
              character={occupied[0]}
              index={result!.characters.indexOf(occupied[0])}
              showUseButton={false}
              onUse={selectCharacter}
              active={singleActive}
            />
            <button
              className={`${styles["hunter-profile__use-btn"]}${singleActive ? ` ${styles["is-active"]}` : ""}`}
              onClick={handleUseSingle}
              disabled={singleActive}
            >
              {singleActive ? "Active hunter" : "Use this hunter"}
            </button>
          </>
        )}

        {occupied && occupied.length > 1 &&
          occupied.map((c) => {
            const index = result!.characters.indexOf(c);
            return (
              <CharacterCard
                key={index}
                character={c}
                index={index}
                showUseButton={showUseButton}
                onUse={selectCharacter}
                active={isActiveHunter(save, c)}
              />
            );
          })}
      </div>
    </div>
  );
}
