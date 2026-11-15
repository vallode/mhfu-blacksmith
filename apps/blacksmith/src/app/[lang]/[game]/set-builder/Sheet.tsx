"use client";

/**
 * A card over the page, for the set builder's skills, options and piece
 * details: the blue frame of the site's overlays (as on the 3D model
 * popover) and the fill of its phone sheets (SplitPage). On phones it rises
 * from the bottom edge, over the tab bar; on wider screens it is a dialog in
 * the middle of the page. Closed by ×, Escape or a tap on the dimmed page.
 */
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import Card from "@/components/Card";
import { cn } from "@/lib/cn";

export default function Sheet({
  open,
  onClose,
  title,
  tall,
  footer,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: React.ReactNode;
  /** Nearly full height (pickers); otherwise it fits its content. */
  tall?: boolean;
  /** Buttons under the scrolling content. */
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const before = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    // The page under the sheet doesn't scroll with it.
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      before?.focus?.();
    };
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  // In a portal, above the tab bar (z-800) and out of the cards' stacking contexts.
  return createPortal(
    <div className="fixed inset-0 z-900 flex flex-col items-center justify-center p-[2.4rem] mobile:justify-end mobile:p-0">
      <button
        type="button"
        aria-label="Close"
        tabIndex={-1}
        className="absolute inset-0 cursor-default border-none bg-black/65 p-0"
        onClick={onClose}
      />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={typeof title === "string" ? title : undefined}
        tabIndex={-1}
        className={cn(
          "relative flex min-h-0 w-full max-w-[64rem] flex-col outline-none [--card-fill:var(--color-sheet)]",
          "motion-safe:animate-toast-in mobile:max-w-none mobile:motion-safe:animate-sheet-in",
          tall ? "h-[min(80dvh,80rem)] mobile:h-[92dvh]" : "max-h-[80dvh] mobile:max-h-[85dvh]",
        )}
      >
        <Card
          frame="blue"
          className="flex-[1_1_auto] text-small"
          bodyClassName="card-p-7 gap-[1.2rem]"
        >
          <div className="flex flex-none items-center gap-[1rem]">
            <h2 className="m-0 min-w-0 flex-1 truncate text-main font-normal text-stat text-shadow-[0.15rem_0.15rem_black]">
              {title}
            </h2>
            <button
              type="button"
              aria-label="Close"
              className="-my-[0.8rem] flex size-[4.4rem] flex-none cursor-pointer items-center justify-center border-none bg-transparent p-0 text-[3rem] leading-none text-white/60 hover:text-white"
              onClick={onClose}
            >
              ×
            </button>
          </div>
          <div className="-mx-[0.4rem] flex min-h-0 flex-1 flex-col gap-[1.3rem] overflow-y-auto overscroll-contain px-[0.4rem]">
            {children}
          </div>
          {footer && (
            <div className="flex flex-none gap-[0.8rem] mobile:mb-[env(safe-area-inset-bottom)]">
              {footer}
            </div>
          )}
        </Card>
      </div>
    </div>,
    document.body,
  );
}
