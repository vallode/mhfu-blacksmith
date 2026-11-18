import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/** tailwind-merge, told about the type scale in globals.css's @theme so
 * `text-main` counts as a font size, not a colour that `text-gold` replaces. */
const twMerge = extendTailwindMerge({
  extend: { theme: { text: ["main", "sub", "small", "fine"] } },
});

/**
 * Merge conditional class names.
 *
 * Accepts strings, arrays, and `{ className: condition }` objects; falsy
 * values are dropped. Conflicting Tailwind utilities are resolved so the
 * later one wins: `cn("px-5 py-4", "py-7")` → "px-5 py-7". Components put
 * their defaults first and the caller's `className` last, so callers can
 * override any default.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
