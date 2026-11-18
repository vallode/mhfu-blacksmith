"use client";

import { useGameText } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";
import { mapIconSrc } from "@/lib/maps";

/**
 * A map's locale icon, decorative (the map's name is always beside it).
 * Renders nothing for a map without one. Sized by the caller (`size-*`).
 */
export default function MapIcon({ map, className }: { map: string; className?: string }) {
  const game = useGameText();
  const src = mapIconSrc(map);
  if (!src) return null;
  return (
    <img
      src={src}
      alt=""
      title={game.name("map", map)}
      decoding="sync"
      className={cn("size-[2.8rem] flex-none object-contain", className)}
    />
  );
}
