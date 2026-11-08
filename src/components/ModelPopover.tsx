"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
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

/** Gap between the popover and the side card's edges, on every side. */
const INSET = 14;
/** Matches the stacked .split-page layout, where the popover floats instead (see the SCSS). */
const STACKED = "(max-width: 600px)";

/**
 * The 3D model, in the alternative blue frame, laid over the side card of
 * the surrounding .split-page. Closes with Escape or its close button.
 */
export default function ModelPopover({ title, onClose, children }: PopoverProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Center the popover inside the side card (the .split-page's first child),
  // measured rather than derived from the layout's CSS so it stays exact.
  useLayoutEffect(() => {
    const popover = popoverRef.current;
    const page = popover?.parentElement;
    const side = page?.firstElementChild as HTMLElement | null | undefined;
    if (!popover || !page || !side || side === popover) return;
    const stacked = window.matchMedia(STACKED);
    const place = () => {
      if (stacked.matches) {
        popover.style.cssText = "";
        return;
      }
      const pageBox = page.getBoundingClientRect();
      const sideBox = side.getBoundingClientRect();
      popover.style.top = `${sideBox.top - pageBox.top + INSET}px`;
      popover.style.left = `${sideBox.left - pageBox.left + INSET}px`;
      popover.style.width = `${sideBox.width - 2 * INSET}px`;
      popover.style.height = `${sideBox.height - 2 * INSET}px`;
      popover.style.bottom = "auto";
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(page);
    observer.observe(side);
    stacked.addEventListener("change", place);
    return () => {
      observer.disconnect();
      stacked.removeEventListener("change", place);
    };
  }, []);
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
    <div ref={popoverRef} className={styles.popover} role="dialog" aria-label={`3D model of ${title}`}>
      {/* No padding, and a layout border exactly as thick as the blue frame's
          visible band (4 source px at 3x), so the render ends at the frame. */}
      <Card frame="blue" className="border-[12px] p-0">
        <div className="flex min-h-0 flex-1">{children}</div>
        {/* `!` on the size: modern-normalize's un-layered `button { font-size: 100% }` beats layered utilities. */}
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Close 3D model"
          className="absolute top-1 right-2 z-20 cursor-pointer px-2 text-[4.4rem]! leading-none text-stat hover:opacity-75 focus-visible:opacity-75 mobile:text-[3.4rem]!"
        >
          ×
        </button>
      </Card>
    </div>
  );
}
