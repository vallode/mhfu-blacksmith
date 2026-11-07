"use client";

import Card from "@/components/Card";
import { useFileSync } from "@/context/FileSyncContext";
import * as ui from "@/styles/settings";

function formatTimeAgo(ts: number): string {
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 60) return "just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default function SaveSyncSettings() {
  const fileSync = useFileSync();

  if (!fileSync.isSupported) {
    return (
      <Card className={ui.section}>
        <h2 className={ui.heading}>Save Sync</h2>
        <p className={ui.note}>
          Automatic save syncing isn&apos;t supported in this browser. You can
          still upload your save file manually from the Hunter page.
        </p>
      </Card>
    );
  }

  if (!fileSync.hasHandle) {
    return (
      <Card className={ui.section}>
        <h2 className={ui.heading}>Save Sync</h2>
        <p className={ui.note}>
          Connect your save file from the Hunter page to have your hunter
          profile refresh automatically whenever you return, no re-uploading
          needed.
        </p>
      </Card>
    );
  }

  const connected = fileSync.permission === "granted";

  return (
    <Card className={ui.section}>
      <h2 className={ui.heading}>Save Sync</h2>
      <p className={ui.note}>
        Your hunter profile refreshes automatically from{" "}
        {fileSync.fileName ?? "your save file"} whenever you return to this
        site — no re-uploading needed.
      </p>

      <div className={ui.status}>
        <span className={ui.statusLabel}>
          {fileSync.syncing
            ? "Syncing…"
            : connected
              ? fileSync.lastSynced
                ? `Last synced ${formatTimeAgo(fileSync.lastSynced)}`
                : "Connected"
              : "Access needs to be reconnected"}
        </span>
      </div>

      {fileSync.error && <p className={ui.error}>{fileSync.error}</p>}

      <div className={ui.actions}>
        {connected ? (
          <button
            type="button"
            className={ui.button}
            disabled={fileSync.syncing}
            onClick={() => fileSync.syncNow()}
          >
            {fileSync.syncing ? "Syncing…" : "Sync now"}
          </button>
        ) : (
          <button
            type="button"
            className={ui.button}
            onClick={() => fileSync.requestReconnect()}
          >
            Reconnect
          </button>
        )}

        <button
          type="button"
          className={ui.buttonSecondary}
          onClick={() => fileSync.forget()}
        >
          Forget save file
        </button>
      </div>
    </Card>
  );
}
