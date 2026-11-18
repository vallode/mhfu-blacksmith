"use client";

/**
 * The weapon tree's sort bar: a grey bar over the bottom of the tree card
 * that reads out the view and filters ("Upgrade tree · Fire") and the match
 * count. The whole bar is the button: it opens a menu above it, in the blue
 * in-game frame, with a section per setting (view, element, hunter) like the
 * item box's sort menu. A green arrow cursor follows the pointer and the
 * arrow keys; each section's choice is yellow. Choosing doesn't close the
 * menu, so several settings can change at once; the bar, Escape or a click
 * outside closes it.
 */
import { Fragment, useEffect, useRef, useState } from "react";
import Card from "./Card";
import { barText, SELECTOR_BAR_HEIGHT } from "./SelectorBar";
import { cn } from "@/lib/cn";

export interface SortOption {
  key: string;
  label: string;
  /** Drawn before the label (an element badge). */
  glyph?: React.ReactNode;
  /** How many weapons it matches, at the right. */
  count?: number;
  selected: boolean;
  choose: () => void;
}

export interface SortSection {
  title: string;
  options: SortOption[];
}

interface Props {
  sections: SortSection[];
  /** The view and filters, as read out on the bar. */
  summary: string;
  /** "12/134" */
  count: string;
  /** The button's accessible name. */
  label: string;
  /** The menu's accessible name. */
  menuLabel: string;
}

/** The game's green arrow (it points left), turned to point up or down. */
function Caret({ down, className }: { down: boolean; className?: string }) {
  return (
    <img
      src="/images/arrow.png"
      alt=""
      aria-hidden="true"
      className={cn(
        "h-[22px] w-auto flex-none transition-transform duration-150 pixelated motion-reduce:transition-none",
        down ? "-rotate-90" : "rotate-90",
        className,
      )}
    />
  );
}

function MenuCursor({ show }: { show: boolean }) {
  return (
    <img
      src="/images/arrow.png"
      alt=""
      aria-hidden="true"
      className={cn("h-[20px] w-auto flex-none -scale-x-100 pixelated", !show && "invisible")}
    />
  );
}

function SortMenu({
  sections,
  label,
  onClose,
}: {
  sections: SortSection[];
  label: string;
  onClose: () => void;
}) {
  const options = sections.flatMap((s) => s.options);
  // Start on the first section's choice (the view).
  const [cursor, setCursor] = useState(() =>
    Math.max(
      0,
      options.findIndex((o) => o.selected),
    ),
  );
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  let index = -1;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="menu"
      aria-label={label}
      className="text-sub outline-none"
      onKeyDown={(event) => {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
          event.preventDefault();
          const by = event.key === "ArrowDown" ? 1 : -1;
          setCursor((c) => (c + by + options.length) % options.length);
        } else if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          options[cursor]?.choose();
        } else if (event.key === "Escape") {
          event.preventDefault();
          onClose();
        }
      }}
    >
      {sections.map((section) => (
        <Fragment key={section.title}>
          <div
            className="my-1 bg-selector px-5 py-[3px] text-fine tracking-[0.2em] text-parchment uppercase"
            aria-hidden="true"
          >
            {section.title}
          </div>
          <div role="group" aria-label={section.title}>
            {section.options.map((option) => {
              const i = ++index;
              return (
                <button
                  key={option.key}
                  type="button"
                  role="menuitemradio"
                  aria-checked={option.selected}
                  tabIndex={-1}
                  onPointerEnter={() => setCursor(i)}
                  onClick={() => {
                    setCursor(i);
                    option.choose();
                  }}
                  className={cn(
                    "flex h-[32px] w-full cursor-pointer items-center gap-3 pr-5 pl-2 text-left",
                    option.selected ? "text-stat" : "text-white",
                  )}
                >
                  <MenuCursor show={cursor === i} />
                  {option.glyph}
                  <span className="min-w-0 flex-auto truncate">{option.label}</span>
                  {option.count !== undefined && (
                    <span className="flex-none text-white/60">{option.count}</span>
                  )}
                </button>
              );
            })}
          </div>
        </Fragment>
      ))}
    </div>
  );
}

export default function TreeSortBar({ sections, summary, count, label, menuLabel }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  // A click anywhere else closes the menu.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <div ref={rootRef}>
      {open && (
        <div
          className="absolute inset-x-[10px] z-3 flex max-h-[calc(100%-80px)] flex-col"
          style={
            {
              bottom: SELECTOR_BAR_HEIGHT + 8,
              "--card-fill": "var(--color-sheet)",
            } as React.CSSProperties
          }
        >
          <Card scroll frame="blue" className="flex-auto" bodyClassName="card-py-[1.4rem]">
            <SortMenu sections={sections} label={menuLabel} onClose={() => close(true)} />
          </Card>
        </div>
      )}
      <button
        ref={buttonRef}
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "group absolute right-[4px] bottom-[4px] left-[4px] z-2 flex h-[56px] cursor-pointer items-center gap-[1.6rem] px-[2rem] text-left transition-[background-color] duration-100",
          "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-white focus-visible:outline-solid",
          open ? "bg-selector-lit" : "bg-selector hover:bg-selector-lit",
        )}
      >
        <span className={cn(barText, "min-w-0 flex-auto truncate text-stat")}>{summary}</span>
        <span className={cn(barText, "flex-none text-white")}>{count}</span>
        <Caret
          down={open}
          className={cn(
            "group-hover:brightness-125",
            open ? "group-hover:translate-y-[2px]" : "group-hover:-translate-y-[2px]",
          )}
        />
      </button>
    </div>
  );
}
