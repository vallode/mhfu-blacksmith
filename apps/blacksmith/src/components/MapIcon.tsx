"use client";

import { useGameText } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";
import { mapIconSrc } from "@/lib/maps";

/**
 * A map's locale icon, decorative (the map's name is always beside it).
 * Renders nothing for a map without one. Sized by the caller (`size-*`).
 * `scroll` sets the icon on the game's scroll, for lists where the bare icon
 * is hard to see against the page.
 */
export default function MapIcon({
  map,
  className,
  scroll,
}: {
  map: string;
  className?: string;
  scroll?: boolean;
}) {
  const game = useGameText();
  const src = mapIconSrc(map);
  if (!src) return null;
  const icon = (
    <img
      src={src}
      alt=""
      title={game.name("map", map)}
      decoding="sync"
      className={cn(
        scroll ? "size-[2.4rem]" : "size-[2.8rem]",
        "flex-none object-contain",
        className,
      )}
    />
  );
  if (!scroll) return icon;
  return (
    <span className="flex h-[3.2rem] w-[4.8rem] flex-none items-center justify-center bg-[url(/images/scroll.png)] bg-contain bg-center bg-no-repeat pixelated">
      {icon}
    </span>
  );
}
