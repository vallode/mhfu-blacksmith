"use client";

/**
 * The weapon type on phones: the game's "◀ Sword and Shield ▶" selector over
 * the top of the weapon tree card. It stands in for the page bar's row of
 * type icons, which on a phone scrolls sideways, takes a row of its own and
 * never names the type. The arrows step through the types; the name opens a
 * grid of every type below the bar, in the blue in-game frame. Escape or a
 * click outside closes it. Wider screens keep the page bar and show none of
 * this.
 */
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Card from "./Card";
import Icon from "./Icon";
import SelectorBar, { SELECTOR_BAR_HEIGHT } from "./SelectorBar";
import { WEAPON_TYPES, type WeaponType } from "@/lib/constants";
import { useT } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";

const typeHref = (type: WeaponType) => `/blacksmith/${type}/`;

export default function WeaponTypeBar({ type }: { type: WeaponType }) {
  const t = useT();
  const nav = t.equipment.nav;
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLElement>(null);
  const name = t.common.weaponTypes[type];

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
    const index = WEAPON_TYPES.indexOf(type);
    setOpen(false);
    router.push(typeHref(WEAPON_TYPES[(index + by + WEAPON_TYPES.length) % WEAPON_TYPES.length]));
  };

  return (
    // contents: the bar and the grid sit over the tree card, placed by the
    // CardBox around it.
    <div ref={rootRef} className="hidden mobile:contents">
      <SelectorBar
        edge="top"
        groupLabel={nav.weaponType}
        previousLabel={nav.previousWeaponType}
        nextLabel={nav.nextWeaponType}
        onStep={step}
        label={
          <button
            ref={buttonRef}
            type="button"
            aria-haspopup="true"
            aria-expanded={open}
            aria-label={nav.chooseWeaponType(name)}
            onClick={() => setOpen((o) => !o)}
            className="flex h-[56px] w-full min-w-0 cursor-pointer items-center text-left text-stat"
          >
            <Icon type={type} size="mini" nav active />
            <span className="min-w-0 truncate">{name}</span>
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
              aria-label={nav.weaponTypes}
              className="grid grid-cols-3 gap-1"
              onKeyDown={(event) => {
                if (event.key !== "Escape") return;
                event.preventDefault();
                setOpen(false);
                buttonRef.current?.focus();
              }}
            >
              {WEAPON_TYPES.map((option) => (
                <Link
                  key={option}
                  href={typeHref(option)}
                  aria-current={option === type ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={cn(
                    "flex min-h-[8.4rem] flex-col items-center justify-start gap-1 px-1 pt-2 pb-3 text-center text-fine leading-tight text-white",
                    "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white focus-visible:outline-solid",
                    option === type
                      ? "bg-(image:--gradient-hover-glow)"
                      : "hover:bg-(image:--gradient-hover-glow)",
                  )}
                >
                  <Icon type={option} size="large" nav active={option === type} className="mr-0" />
                  {t.common.weaponTypes[option]}
                </Link>
              ))}
            </nav>
          </Card>
        </div>
      )}
    </div>
  );
}
