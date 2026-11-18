import { cn } from "@/lib/cn";
import type { ElementFilterId } from "@/lib/tree-filter";

const GROUPS: Partial<Record<ElementFilterId, string[]>> = {
  any: ["fire", "water", "thunder", "ice"],
  status: ["poison", "paralysis", "sleep"],
};

/**
 * An element filter's badge, from the game's element sprites: the element's
 * own, a 2×2 of them for Any element and Any status, a dash for no element,
 * and an empty square of the same size for All, so labels line up.
 */
export default function ElementGlyph({
  filter,
  size = 20,
  className,
}: {
  filter: ElementFilterId;
  size?: number;
  className?: string;
}) {
  const box = { width: size, height: size };
  const group = GROUPS[filter];
  if (group) {
    return (
      <span className={cn("grid flex-none grid-cols-2", className)} style={box} aria-hidden="true">
        {group.map((el) => (
          <img key={el} src={`/images/${el}.png`} alt="" className="size-full pixelated" />
        ))}
      </span>
    );
  }
  if (filter === "all" || filter === "none") {
    return (
      <span
        className={cn("flex flex-none items-center justify-center text-white/60", className)}
        style={box}
        aria-hidden="true"
      >
        {filter === "none" && "—"}
      </span>
    );
  }
  return (
    <img
      src={`/images/${filter}.png`}
      alt=""
      className={cn("flex-none pixelated", className)}
      style={box}
    />
  );
}
