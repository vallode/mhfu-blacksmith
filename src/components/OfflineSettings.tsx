"use client";

import Card from "@/components/Card";
import { useOffline, type OfflineDownloadStatus } from "@/context/OfflineContext";
import styles from "@/styles/options.module.scss";

function primaryLabel(
  status: OfflineDownloadStatus,
  cached: number,
  progress: number
): string {
  switch (status) {
    case "checking":
      return "Checking…";
    case "downloading":
      return `Downloading… ${progress}%`;
    case "complete":
      return "Re-download";
    case "error":
      return "Retry";
    default:
      return cached > 0 ? "Finish downloading" : "Download for offline";
  }
}

export default function OfflineSettings() {
  const offline = useOffline();

  if (offline.status === "unsupported") {
    return (
      <Card className={styles.section}>
        <h2 className={styles.heading}>Offline Data</h2>
        <p className={styles.note}>
          Offline downloads aren&apos;t supported in this browser.
        </p>
      </Card>
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
    <Card className={styles.section}>
      <h2 className={styles.heading}>Offline Data</h2>
      <p className={styles.note}>
        Save weapon, armor, monster, and decoration data to this device so
        search, the calculator, and browsing work without a connection. This
        stays here whenever you want to (re)download or clear it — unlike the
        one-time popup.
      </p>

      <div className={styles.status}>
        <span className={styles.statusLabel}>
          {offline.status === "checking"
            ? "Checking cached files…"
            : `${offline.cached} / ${offline.total} files cached`}
        </span>
        <progress className={styles.progress} value={pct} max={100} />
      </div>

      {offline.status === "error" && (
        <p className={styles.error}>
          Something went wrong. Check your connection and try again.
        </p>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.button}
          disabled={busy}
          onClick={() => offline.download()}
        >
          {primaryLabel(offline.status, offline.cached, offline.progress)}
        </button>

        {offline.cached > 0 && !busy && (
          <button
            type="button"
            className={styles.buttonSecondary}
            onClick={() => offline.clear()}
          >
            Clear offline data
          </button>
        )}
      </div>
    </Card>
  );
}
