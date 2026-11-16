"use client";

import SettingsCard from "@/components/SettingsCard";
import { useOffline, type OfflineDownloadStatus } from "@/context/OfflineContext";
import { useT } from "@/context/LanguageContext";
import type { Messages } from "@/lib/i18n/messages";
import * as ui from "@/styles/settings";

function primaryLabel(
  text: Messages["site"]["offline"],
  status: OfflineDownloadStatus,
  cached: number,
  progress: number,
): string {
  switch (status) {
    case "checking":
      return text.checking;
    case "downloading":
      return text.downloading(progress);
    case "complete":
      return text.redownload;
    case "error":
      return text.retry;
    default:
      return cached > 0 ? text.finish : text.download;
  }
}

export default function OfflineSettings() {
  const offline = useOffline();
  const text = useT().site.offline;

  if (offline.status === "unsupported") {
    return (
      <SettingsCard title={text.title}>
        <p className={ui.note}>{text.unsupported}</p>
      </SettingsCard>
    );
  }

  const busy = offline.status === "checking" || offline.status === "downloading";
  const pct =
    offline.status === "downloading"
      ? offline.progress
      : offline.total > 0
        ? Math.round((offline.cached / offline.total) * 100)
        : 0;

  return (
    <SettingsCard title={text.title}>
      <p className={ui.note}>{text.note}</p>

      <div className={ui.status}>
        <span className={ui.statusLabel}>
          {offline.status === "checking"
            ? text.checkingFiles
            : text.filesCached(offline.cached, offline.total)}
        </span>
        <progress className={ui.progress} value={pct} max={100} />
      </div>

      {offline.status === "error" && <p className={ui.error}>{text.error}</p>}

      <div className={ui.actions}>
        <button
          type="button"
          className={ui.button}
          disabled={busy}
          onClick={() => offline.download()}
        >
          {primaryLabel(text, offline.status, offline.cached, offline.progress)}
        </button>

        {offline.cached > 0 && !busy && (
          <button type="button" className={ui.buttonSecondary} onClick={() => offline.clear()}>
            {text.clear}
          </button>
        )}
      </div>
    </SettingsCard>
  );
}
