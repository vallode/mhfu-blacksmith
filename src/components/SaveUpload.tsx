"use client";

import { useCallback, useRef, useState } from "react";
import { useSaveWorker, type CharacterResult, type Region } from "@/hooks/useSaveWorker";
import { useSave } from "@/context/SaveContext";
import Card from "@/components/Card";
import styles from "@/styles/hunter.module.scss";

function formatZenny(n: number): string {
  return n.toLocaleString();
}

interface CharacterCardProps {
  character: CharacterResult;
  index: number;
  showUseButton: boolean;
  decrypted: boolean;
}

function CharacterCard({ character, index, showUseButton, decrypted }: CharacterCardProps) {
  const { load } = useSave();

  const handleUse = () => {
    const allItems = [...character.itemChest, ...character.itemPouch];
    load({
      name: character.name,
      region: "us",
      items: allItems,
    });
  };

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
            onClick={handleUse}
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
  const [isDragOver, setIsDragOver] = useState(false);
  const regionRef = useRef<HTMLSelectElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const processFile = useCallback(
    async (file: File) => {
      const region = (regionRef.current?.value ?? "us") as Region;
      const buffer = await file.arrayBuffer();
      parse(buffer, region);
    },
    [parse]
  );

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => setIsDragOver(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const occupied = result?.characters.filter(Boolean) as CharacterResult[] | undefined;
  const showUseButton = (occupied?.length ?? 0) > 1;

  const handleUseSingle = () => {
    if (!occupied || occupied.length !== 1) return;
    const c = occupied[0];
    load({
      name: c.name,
      region: regionRef.current?.value ?? "us",
      items: [...c.itemChest, ...c.itemPouch],
    });
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

        <select ref={regionRef} className={styles["save-upload__region"]}>
          <option value="us">US (ULUS-10391)</option>
          <option value="eu">EU (ULES-01213)</option>
          <option value="jp">JP (ULJM-05500)</option>
        </select>

        <p className={styles["save-upload__note"]}>
          Supports PPSSPP saves (both default and decrypted exports).{" "}
          <em>The file never leaves your device.</em>
        </p>
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
              index={0}
              showUseButton={false}
              decrypted={result!.decrypted}
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
          occupied.map((c, i) => (
            <CharacterCard
              key={i}
              character={c}
              index={i}
              showUseButton={showUseButton}
              decrypted={result!.decrypted}
            />
          ))}
      </div>
    </div>
  );
}
