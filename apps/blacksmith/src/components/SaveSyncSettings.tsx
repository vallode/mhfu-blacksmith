"use client";

import SettingsCard from "@/components/SettingsCard";
import { useFileSync } from "@/context/FileSyncContext";
import { useT } from "@/context/LanguageContext";
import type { Messages } from "@/lib/i18n/messages";
import * as ui from "@/styles/settings";

function formatTimeAgo(ts: number, ago: Messages["site"]["saveSync"]["ago"]): string {
  const seconds = Math.max(0, Math.round((Date.now() - ts) / 1000));
  if (seconds < 60) return ago.justNow;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return ago.minutes(minutes);
  const hours = Math.round(minutes / 60);
  if (hours < 24) return ago.hours(hours);
  return ago.days(Math.round(hours / 24));
}

export default function SaveSyncSettings() {
  const fileSync = useFileSync();
  const text = useT().site.saveSync;

  if (!fileSync.isSupported) {
    return (
      <SettingsCard title={text.title}>
        <p className={ui.note}>{text.unsupported}</p>
      </SettingsCard>
    );
  }

  if (!fileSync.hasHandle) {
    return (
      <SettingsCard title={text.title}>
        <p className={ui.note}>{text.notConnected}</p>
      </SettingsCard>
    );
  }

  const connected = fileSync.permission === "granted";

  return (
    <SettingsCard title={text.title}>
      <p className={ui.note}>{text.connectedNote(fileSync.fileName)}</p>

      <div className={ui.status}>
        <span className={ui.statusLabel}>
          {fileSync.syncing
            ? text.syncing
            : connected
              ? fileSync.lastSynced
                ? text.lastSynced(formatTimeAgo(fileSync.lastSynced, text.ago))
                : text.connected
              : text.needsReconnect}
        </span>
      </div>

      {fileSync.error && (
        <p className={ui.error}>{fileSync.error.message ?? text.errors[fileSync.error.code]}</p>
      )}

      <div className={ui.actions}>
        {connected ? (
          <button
            type="button"
            className={ui.button}
            disabled={fileSync.syncing}
            onClick={() => fileSync.syncNow()}
          >
            {fileSync.syncing ? text.syncing : text.syncNow}
          </button>
        ) : (
          <button type="button" className={ui.button} onClick={() => fileSync.requestReconnect()}>
            {text.reconnect}
          </button>
        )}

        <button type="button" className={ui.buttonSecondary} onClick={() => fileSync.forget()}>
          {text.forget}
        </button>
      </div>
    </SettingsCard>
  );
}
