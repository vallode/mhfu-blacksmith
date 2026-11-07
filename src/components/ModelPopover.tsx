"use client";

import { useEffect, useRef } from "react";
import Card from "@/components/Card";
import styles from "./ModelPopover.module.scss";

interface ButtonProps {
  open: boolean;
  onClick: () => void;
}

/** Toggles the 3D model popover. */
export function ModelButton({ open, onClick }: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className="cursor-pointer self-start text-stat hover:underline focus-visible:underline"
    >
      {open ? "Hide 3D model" : "View 3D model"}
    </button>
  );
}

interface PopoverProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/**
 * The 3D model, in the alternative blue frame, laid over the side card of
 * the surrounding .split-page. Closes with Escape or its close button.
 */
export default function ModelPopover({ title, onClose, children }: PopoverProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  // Callers pass a fresh onClose each render; read it through a ref so the
  // effect below runs once (it moves focus, which must not repeat).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className={styles.popover} role="dialog" aria-label={`3D model of ${title}`}>
      <Card frame="blue" className="gap-4">
        <div className="flex items-center justify-between gap-4">
          <p className="overflow-hidden text-ellipsis">{title}</p>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close 3D model"
            className="cursor-pointer px-2 leading-none text-stat hover:text-white focus-visible:text-white"
          >
            ×
          </button>
        </div>
        <div className="flex min-h-0 flex-1">{children}</div>
      </Card>
    </div>
  );
}
