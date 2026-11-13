"use client";

import { progressBar } from "@/styles/progress";

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

const actionButton = [
  "cursor-pointer border border-hr bg-transparent px-[0.8rem] py-[0.25rem] font-[inherit] text-fine text-white/85",
  "hover:text-white hover:hover-glow focus-visible:text-white focus-visible:hover-glow",
].join(" ");

export default function ToastViewport({ toasts, onDismiss }: ToastViewportProps) {
  if (toasts.length === 0) return null;

  return (
    // Bottom-centre stack, newest at the bottom. Only the toasts themselves
    // take pointer events, so the page stays clickable around them.
    <div
      className="pointer-events-none fixed bottom-[1.4rem] left-1/2 z-900 flex w-full max-w-[min(42rem,calc(100vw-2.8rem))] -translate-x-1/2 flex-col-reverse gap-[0.8rem] mobile:bottom-[calc(var(--spacing-tabbar)+1.4rem)]"
      aria-live="polite"
      aria-relevant="additions"
    >
      {toasts.map((t) => (
        <div
          key={t.id}
          className="frame-cover pointer-events-auto relative flex animate-toast-in flex-col gap-[0.8rem] card-frame-teal px-[1.4rem] py-[1rem] motion-reduce:animate-none"
          role="status"
        >
          <button
            type="button"
            className="absolute top-[0.6rem] right-[1.2rem] cursor-pointer border-none bg-transparent px-[0.4rem] py-[0.2rem] font-[inherit] text-sub leading-none text-white/50 hover:text-white focus-visible:text-white"
            onClick={() => onDismiss(t.id)}
            aria-label="Dismiss"
          >
            ×
          </button>
          {t.title && (
            <p className="m-0 pr-[2rem] text-small leading-[1.2] tracking-[0.15ch] text-parchment uppercase text-shadow-[0.15rem_0.15rem_black]">
              {t.title}
            </p>
          )}
          <p className="m-0 text-small leading-[1.35] text-inherit">{t.message}</p>
          {t.progress != null && <progress className={progressBar} value={t.progress} max={100} />}
          {t.actions && t.actions.length > 0 && (
            <div className="mt-[0.2rem] flex flex-wrap gap-[0.6rem]">
              {t.actions.map((a) => (
                <button key={a.label} type="button" className={actionButton} onClick={a.onClick}>
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
