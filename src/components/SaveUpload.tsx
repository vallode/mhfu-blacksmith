"use client";

import { useCallback, useRef, useState } from "react";
import { useSaveWorker, type CharacterResult, type Region } from "@/hooks/useSaveWorker";
import { useSave } from "@/context/SaveContext";
import { useFileSync } from "@/context/FileSyncContext";
import Card from "@/components/Card";
import styles from "@/styles/hunter.module.scss";

function formatZenny(n: number): string {
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

interface CharacterCardProps {
  character: CharacterResult;
  index: number;
  showUseButton: boolean;
  decrypted: boolean;
  onUse: (index: number) => void;
}

function CharacterCard({ character, index, showUseButton, decrypted, onUse }: CharacterCardProps) {
  return (
    <Card>
      <div className={styles["hunter-profile"]}>
        <div className={styles["hunter-profile__header"]}>
          <span className={styles["hunter-profile__name"]}>{character.name}</span>
          <span className={styles["hunter-profile__sex"]}>{character.sex}</span>
        </div>

        <div className={styles["hunter-profile__stats"]}>
          <div className={styles["hunter-profile__stat"]}>
            <span className={styles["hunter-profile__label"]}>Zenny</span>
            <span className={styles["hunter-profile__value"]}>
              <img src="/images/zenny.png" alt="" />
              {formatZenny(character.zenny)}
            </span>
          </div>
          <div className={styles["hunter-profile__stat"]}>
            <span className={styles["hunter-profile__label"]}>Equipment</span>
            <span className={styles["hunter-profile__value"]}>
              {character.equipTotal}
            </span>
          </div>
          <div className={styles["hunter-profile__stat"]}>
            <span className={styles["hunter-profile__label"]}>Items (chest)</span>
            <span className={styles["hunter-profile__value"]}>
              {character.itemChest.length}
            </span>
          </div>
        </div>

        {decrypted && (
          <p className={styles["save-upload__source"]}>
            Game-layer decryption applied.
          </p>
        )}

        {showUseButton && (
          <button
            className={styles["hunter-profile__use-btn"]}
            onClick={() => onUse(index)}
          >
            Use hunter {index + 1}
          </button>
        )}
      </div>
    </Card>
  );
}

export default function SaveUpload() {
  const { parse, result, error, loading } = useSaveWorker();
  const { load } = useSave();
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
      load({
        name: character.name,
        region: regionRef.current?.value ?? "us",
        items: [...character.itemChest, ...character.itemPouch],
      });
      // Only remember the slot against the stored handle when this result is
      // that handle's file; a dropped/uploaded file may be a different save.
      if (fromPickerRef.current) fileSync.confirmSelection(index);
    },
    [result, load, fileSync]
  );

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
              decrypted={result!.decrypted}
              onUse={selectCharacter}
            />
            <button
              className={styles["hunter-profile__use-btn"]}
              onClick={handleUseSingle}
            >
              Use this hunter
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
                decrypted={result!.decrypted}
                onUse={selectCharacter}
              />
            );
          })}
      </div>
    </div>
  );
}
