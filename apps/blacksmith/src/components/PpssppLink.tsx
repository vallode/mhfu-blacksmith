"use client";

import { useState } from "react";
import { formatTimeAgo } from "@/components/SaveSyncSettings";
import { usePpssppLink } from "@/context/PpssppLinkContext";
import { useT } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";
import * as ui from "@/styles/settings";

/**
 * Turns the PPSSPP link on and off, and says what it last found: shown on
 * the hunter's Save File page and in Options → Save Sync.
 */
export default function PpssppLink() {
  const link = usePpssppLink();
  const t = useT().site;
  const text = t.ppssppLink;

  if (!link.enabled) {
    return (
      <div className="flex flex-col gap-[1rem]">
        <p className={ui.note}>{text.intro}</p>
        <p className={ui.note}>{text.setup}</p>
        <div className={ui.actions}>
          <button type="button" className={ui.button} onClick={() => link.enable()}>
            {text.link}
          </button>
        </div>
      </div>
    );
  }

  const status = (() => {
    switch (link.status) {
      case "linked":
        return text.linked(
          link.gameId ?? "PPSSPP",
          link.lastSynced ? formatTimeAgo(link.lastSynced, t.saveSync.ago) : t.saveSync.ago.justNow,
        );
      case "otherGame":
        return text.otherGame(link.gameId ?? "");
      case "notFound":
      case "noGame":
      case "noHunter":
      case "searching":
        return text[link.status];
      default:
        return text.searching;
    }
  })();

  return (
    <div className="flex flex-col gap-[1rem]">
      <div className={ui.status} aria-live="polite">
        <span className={ui.statusLabel}>{link.syncing ? text.syncing : status}</span>
      </div>
      {link.status === "notFound" && (
        <>
          <p className={ui.note}>{text.setup}</p>
          <PortForm />
        </>
      )}
      {link.error && <p className={ui.error}>{link.error}</p>}
      <div className={ui.actions}>
        <button
          type="button"
          className={ui.button}
          disabled={link.syncing}
          onClick={() => link.syncNow()}
        >
          {text.syncNow}
        </button>
        <button type="button" className={ui.buttonSecondary} onClick={link.disable}>
          {text.unlink}
        </button>
      </div>
    </div>
  );
}

/**
 * PPSSPP's port, typed in: for when its discovery list doesn't list this
 * browser's PPSSPP (Safari gets an empty list).
 */
function PortForm() {
  const link = usePpssppLink();
  const text = useT().site.ppssppLink;
  const [value, setValue] = useState(link.port ? String(link.port) : "");
  const port = Number(value);
  const valid = Number.isInteger(port) && port > 0 && port < 65536;
  return (
    <form
      className="flex flex-col gap-[0.8rem]"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) link.setPort(port);
      }}
    >
      <p className={ui.note}>{text.portHint}</p>
      <div className={ui.actions}>
        <label className="flex items-center gap-[0.8rem] text-small text-white">
          {text.port}
          <input
            type="text"
            inputMode="numeric"
            pattern="[0-9]*"
            className={cn(ui.searchInput, "w-cells-7")}
            value={value}
            onChange={(e) => setValue(e.target.value.trim())}
          />
        </label>
        <button type="submit" className={ui.button} disabled={!valid || link.syncing}>
          {text.connect}
        </button>
      </div>
    </form>
  );
}
