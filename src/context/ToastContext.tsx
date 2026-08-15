"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from "react";
import ToastViewport, {
  type ToastAction,
  type ToastItem,
} from "@/components/Toast";

export type { ToastAction };

export interface ToastInput {
  /** Stable id — reusing it updates the existing toast instead of stacking. */
  id?: string;
  title?: string;
  message: string;
  /** Auto-dismiss after this many ms. `null` keeps it until dismissed. Default 5000. */
  duration?: number | null;
  /** 0–100; renders a progress bar when set. */
  progress?: number;
  actions?: ToastAction[];
  onDismiss?: () => void;
}

interface ToastContextValue {
  toast: (input: ToastInput) => string;
  update: (id: string, patch: Partial<ToastInput>) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue>({
  toast: () => "",
  update: () => {},
  dismiss: () => {},
});

let nextId = 0;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, number>());
  const onDismiss = useRef(new Map<string, () => void>());
  const dismissRef = useRef<(id: string) => void>(() => {});

  const clearTimer = useCallback((id: string) => {
    const handle = timers.current.get(id);
    if (handle !== undefined) window.clearTimeout(handle);
    timers.current.delete(id);
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      const cb = onDismiss.current.get(id);
      onDismiss.current.delete(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
      cb?.();
    },
    [clearTimer],
  );
  dismissRef.current = dismiss;

  const schedule = useCallback(
    (id: string, duration: number | null | undefined) => {
      clearTimer(id);
      if (duration === null) return;
      const ms = duration ?? 5000;
      if (ms <= 0) return;
      timers.current.set(
        id,
        window.setTimeout(() => dismissRef.current(id), ms),
      );
    },
    [clearTimer],
  );

  const toast = useCallback(
    (input: ToastInput) => {
      const id = input.id ?? `toast-${++nextId}`;
      if (input.onDismiss) onDismiss.current.set(id, input.onDismiss);
      else onDismiss.current.delete(id);

      setToasts((prev) => {
        const item: ToastItem = {
          id,
          title: input.title,
          message: input.message,
          progress: input.progress,
          actions: input.actions,
        };
        const idx = prev.findIndex((t) => t.id === id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = { ...next[idx], ...item };
          return next;
        }
        return [...prev, item];
      });
      schedule(id, input.duration);
      return id;
    },
    [schedule],
  );

  const update = useCallback(
    (id: string, patch: Partial<ToastInput>) => {
      if (patch.onDismiss) onDismiss.current.set(id, patch.onDismiss);
      setToasts((prev) =>
        prev.map((t) =>
          t.id === id
            ? {
                ...t,
                title: patch.title ?? t.title,
                message: patch.message ?? t.message,
                progress: "progress" in patch ? patch.progress : t.progress,
                actions: "actions" in patch ? patch.actions : t.actions,
              }
            : t,
        ),
      );
      if ("duration" in patch) schedule(id, patch.duration);
    },
    [schedule],
  );

  const value = useMemo(
    () => ({ toast, update, dismiss }),
    [toast, update, dismiss],
  );

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
