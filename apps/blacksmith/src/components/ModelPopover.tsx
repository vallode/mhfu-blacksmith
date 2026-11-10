"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import Card from "@/components/Card";
import { cn } from "@/lib/cn";

/**
 * Desktop: absolutely positioned in the .split-page (position: relative); the
 * exact box over the side card is set from measurement in a layout effect.
 * Phone (stacked layout): the cards stack and the page scrolls, so there's no
 * fixed-height side card to sit in; float over the viewport instead.
 */
const POPOVER_CLASSES =
  "absolute top-0 bottom-0 left-0 z-30 flex w-1/2 mobile:fixed mobile:top-1/2 mobile:right-4 mobile:bottom-auto mobile:left-4 mobile:z-50 mobile:h-[min(75vh,36rem)] mobile:w-auto mobile:-translate-y-1/2";

interface ButtonProps {
  open: boolean;
  onClick: () => void;
  className?: string;
}

/**
 * A small isometric cube in the style of the game's item sprites, one
 * character per pixel: o outline, t top face, l left face, r right face,
 * e the front edge.
 */
const CUBE = [
  ".....ooo.....",
  "...ootttoo...",
  ".ootttttttoo.",
  "ottttttttttto",
  "olltttttttrro",
  "olllltttrrrro",
  "olllllerrrrro",
  "olllllerrrrro",
  "olllllerrrrro",
  "olllllerrrrro",
  "olllllerrrrro",
  ".oolllerrroo.",
  "...ooleroo...",
  ".....ooo.....",
];

const CUBE_FILL: Record<string, string> = {
  o: "fill-[#0b0b0b]",
  t: "fill-[#ece8d2]",
  l: "fill-parchment",
  r: "fill-[#7d7966]",
  e: "fill-[#d8d3b6]",
};

/** The cube as SVG rects, one per run of same-coloured pixels. */
function CubeSprite() {
  const width = CUBE[0].length;
  return (
    <svg
      viewBox={`0 0 ${width} ${CUBE.length}`}
      className="h-[2.8rem] w-[2.6rem]"
      shapeRendering="crispEdges"
      aria-hidden
    >
      {CUBE.flatMap((row, y) =>
        [...row.matchAll(/([^.])\1*/g)].map((run) => (
          <rect
            key={`${run.index}-${y}`}
            x={run.index}
            y={y}
            width={run[0].length}
            height={1}
            className={CUBE_FILL[run[1]]}
          />
        )),
      )}
    </svg>
  );
}

/**
 * Toggles the 3D model popover: a cube sprite beside the item's name. It
 * pulses green on hover like a list row and stays lit while the model is open.
 */
export function ModelButton({ open, onClick, className }: ButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={open}
      aria-label={open ? "Hide 3D model" : "View 3D model"}
      title={open ? "Hide 3D model" : "View 3D model"}
      className={cn(
        "flex flex-none cursor-pointer items-center px-[0.8rem] py-[0.4rem] hover:hover-glow focus-visible:hover-glow",
        open && "bg-(image:--gradient-hover-glow)",
        className,
      )}
    >
      <CubeSprite />
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
const STACKED = "(max-width: 899px)";

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
    <div
      ref={popoverRef}
      className={POPOVER_CLASSES}
      role="dialog"
      aria-label={`3D model of ${title}`}
    >
      {/* Padding exactly as thick as the blue frame's visible band (4 source
          px at 3x), so the render ends at the frame. */}
      <Card frame="blue" bodyClassName="card-p-[1.2rem]">
        <div className="flex min-h-0 flex-1">{children}</div>
      </Card>
      {/* Outside the card, so it sits over the frame rather than under it. */}
      <button
        ref={closeRef}
        type="button"
        onClick={onClose}
        aria-label="Close 3D model"
        className="absolute top-1 right-2 z-20 cursor-pointer px-2 text-[4.4rem] leading-none text-stat hover:opacity-75 focus-visible:opacity-75 mobile:text-[3.4rem]"
      >
        ×
      </button>
    </div>
  );
}
