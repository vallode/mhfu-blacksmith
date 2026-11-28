"use client";

/**
 * A section's types on phones: the game's "◀ Sword and Shield ▶" selector
 * over the top of the tree card, for the weapon types, armor slots, monster
 * types and a quest board's star levels. It stands in for the page bar's row of type icons, which on
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

interface Props<T extends string | number> {
  /** Every type, in order; also each type's icon, unless `icon` draws it. */
  types: readonly T[];
  current: T;
  /** Each type's page. Without it, picking a type calls `onSelect`. */
  href?: (type: T) => string;
  /** Picks a type on the same page (a quest board's star level). */
  onSelect?: (type: T) => void;
  name: (type: T) => string;
  /** Monster type icons (/images/monsters/), not equipment ones. */
  monster?: boolean;
  /** Draws a type's icon instead of its sprite: in the bar, or larger in the grid. */
  icon?: (type: T, place: "bar" | "grid", active: boolean) => React.ReactNode;
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

export default function TypeBar<T extends string | number>({
  types,
  current,
  href,
  onSelect,
  name,
  monster,
  icon,
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
    pick(types[(index + by + types.length) % types.length]);
  };

  const pick = (type: T) => {
    if (href) router.push(href(type));
    else onSelect?.(type);
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
            {icon ? (
              icon(current, "bar", true)
            ) : monster ? (
              <Icon
                type={String(current)}
                size="large"
                monster
                nav
                active
                className="m-0 mr-[6px]"
              />
            ) : (
              <Icon type={String(current)} size="mini" nav active />
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
              {types.map((option) => {
                const active = option === current;
                const className = cn(
                  "flex min-h-[8.4rem] cursor-pointer flex-col items-center justify-start gap-1 px-1 pt-2 pb-3 text-center text-fine leading-tight text-white",
                  "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white focus-visible:outline-solid",
                  active
                    ? "bg-(image:--gradient-hover-glow)"
                    : "hover:bg-(image:--gradient-hover-glow)",
                );
                const content = (
                  <>
                    {/* Centred in the cell: monster icons keep their 52px slot
                        with an even margin. */}
                    {icon ? (
                      icon(option, "grid", active)
                    ) : (
                      <Icon
                        type={String(option)}
                        size="large"
                        monster={monster}
                        nav
                        active={active}
                        className={monster ? "m-[8px]" : "mr-0"}
                      />
                    )}
                    {name(option)}
                  </>
                );
                return href ? (
                  <Link
                    key={option}
                    href={href(option)}
                    aria-current={active ? "page" : undefined}
                    onClick={() => setOpen(false)}
                    className={className}
                  >
                    {content}
                  </Link>
                ) : (
                  <button
                    key={option}
                    type="button"
                    aria-current={active ? "true" : undefined}
                    onClick={() => {
                      setOpen(false);
                      onSelect?.(option);
                    }}
                    className={className}
                  >
                    {content}
                  </button>
                );
              })}
            </nav>
          </Card>
        </div>
      )}
    </div>
  );
}
