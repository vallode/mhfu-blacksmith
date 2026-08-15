"use client";

import styles from "./Toast.module.scss";

export interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
}

export interface ToastItem {
  id: string;
  title?: string;
  message: string;
  progress?: number;
  actions?: ToastAction[];
}

interface ToastViewportProps {
  toasts: ToastItem[];
  onDismiss: (id: string) => void;
}

export default function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  if (toasts.length === 0) return null;

  return (
    <div className={styles.viewport} aria-live="polite" aria-relevant="additions">
      {toasts.map((t) => (
        <div key={t.id} className={styles.toast} role="status">
          <button
            type="button"
            className={styles.close}
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss"
          >
            ×
          </button>
          {t.title && <p className={styles.title}>{t.title}</p>}
          <p className={styles.message}>{t.message}</p>
          {t.progress != null && (
            <progress
              className={styles.progress}
              value={t.progress}
              max={100}
            />
          )}
          {t.actions && t.actions.length > 0 && (
            <div className={styles.actions}>
              {t.actions.map((a) => (
                <button
                  key={a.label}
                  type="button"
                  className={styles.action}
                  onClick={a.onClick}
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
