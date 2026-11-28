"use client";

/**
 * A section's types on phones: the game's "◀ Sword and Shield ▶" selector
 * over the top of the tree card, for the weapon types, armor slots and
 * monster types. It stands in for the page bar's row of type icons, which on
 * a phone scrolls sideways, takes a row of its own and never names the type.
 * The arrows step through the types; the name opens a grid of every type
 * below the bar, in the blue in-game frame. Escape or a click outside closes
 * it. Wider screens keep the page bar and show none of this.
 *
 * The card under it starts with a `TypeBarSpace`, so its rows start (and
 * scroll into view) below the bar.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Card from "./Card";
import Icon from "./Icon";
import SelectorBar, { SELECTOR_BAR_HEIGHT } from "./SelectorBar";
import { cn } from "@/lib/cn";

/** For the tree card's body: rows scroll into view below the bar on phones. */
export const typeBarScrollPadding = "mobile:scroll-pt-[60px]";

/** The room the bar takes at the top of the tree card, on phones only. */
export function TypeBarSpace() {
  return (
    <div
      className="hidden flex-none mobile:block"
      style={{ height: SELECTOR_BAR_HEIGHT }}
      aria-hidden="true"
    />
  );
}

interface Props<T extends string> {
  /** Every type, in order; also each type's icon. */
  types: readonly T[];
  current: T;
  href: (type: T) => string;
  name: (type: T) => string;
  /** Monster type icons (/images/monsters/), not equipment ones. */
  monster?: boolean;
  labels: {
    /** The bar's group, e.g. "Weapon type". */
    group: string;
    previous: string;
    next: string;
    /** The name button, which opens the grid: "Weapon type: Bow. Choose another". */
    choose: (name: string) => string;
    /** The grid, e.g. "Weapon types". */
    grid: string;
  };
}

export default function TypeBar<T extends string>({
  types,
  current,
  href,
  name,
  monster,
  labels,
}: Props<T>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLElement>(null);
  const currentName = name(current);

  // A click anywhere else closes the grid.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  // Opening it moves focus to the current type, so the arrow keys and Tab
  // start there.
  useEffect(() => {
    if (open) gridRef.current?.querySelector<HTMLElement>("[aria-current]")?.focus();
  }, [open]);

  const step = (by: 1 | -1) => {
    const index = types.indexOf(current);
    setOpen(false);
    router.push(href(types[(index + by + types.length) % types.length]));
  };

  return (
    // contents: the bar and the grid sit over the tree card, placed by the
    // CardBox around it.
    <div ref={rootRef} className="hidden mobile:contents">
      <SelectorBar
        edge="top"
        groupLabel={labels.group}
        previousLabel={labels.previous}
        nextLabel={labels.next}
        onStep={step}
        label={
          <button
            ref={buttonRef}
            type="button"
            aria-haspopup="true"
            aria-expanded={open}
            aria-label={labels.choose(currentName)}
            onClick={() => setOpen((o) => !o)}
            className="flex h-[56px] w-full min-w-0 cursor-pointer items-center text-left text-stat"
          >
            {/* Monster sprites are drawn at their own 36px, the only size
                their tint mask lines up with (see iconStyle). */}
            {monster ? (
              <Icon type={current} size="large" monster nav active className="m-0 mr-[6px]" />
            ) : (
              <Icon type={current} size="mini" nav active />
            )}
            <span className="min-w-0 truncate">{currentName}</span>
            <img
              src="/images/arrow.png"
              alt=""
              aria-hidden="true"
              className={cn(
                "ml-3 h-[16px] w-auto flex-none transition-transform duration-150 pixelated motion-reduce:transition-none",
                open ? "rotate-90" : "-rotate-90",
              )}
            />
          </button>
        }
      />

      {open && (
        <div
          className="absolute inset-x-[10px] z-3 flex max-h-[calc(100%-80px)] flex-col"
          style={
            {
              top: SELECTOR_BAR_HEIGHT + 8,
              "--card-fill": "var(--color-sheet)",
            } as React.CSSProperties
          }
        >
          <Card scroll frame="blue" className="flex-auto" bodyClassName="card-p-[1.6rem]">
            <nav
              ref={gridRef}
              aria-label={labels.grid}
              className="grid grid-cols-3 gap-1"
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                setOpen(false);
                buttonRef.current?.focus();
              }}
            >
              {types.map((option) => (
                <Link
                  key={option}
                  href={href(option)}
                  aria-current={option === current ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex min-h-[8.4rem] flex-col items-center justify-start gap-1 px-1 pt-2 pb-3 text-center text-fine leading-tight text-white",
                    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white focus-visible:outline-solid",
                    option === current
                      ? "bg-(image:--gradient-hover-glow)"
                      : "hover:bg-(image:--gradient-hover-glow)",
                  )}
                >
                  {/* Centred in the cell: monster icons keep their 52px slot
                      with an even margin. */}
                  <Icon
                    type={option}
                    size="large"
                    monster={monster}
                    nav
                    active={option === current}
                    className={monster ? "m-[8px]" : "mr-0"}
                  />
                  {name(option)}
                </Link>
              ))}
            </nav>
          </Card>
        </div>
      )}
    </div>
  );
}
