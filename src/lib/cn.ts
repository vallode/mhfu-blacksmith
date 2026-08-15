import { clsx, type ClassValue } from "clsx";

/**
 * Merge conditional class names.
 *
 * Accepts strings, arrays, and `{ className: condition }` objects; falsy
 * values are dropped. This project doesn't use Tailwind, so a plain clsx
 * re-export is all we need — if Tailwind is ever adopted, swap the body for
 * `twMerge(clsx(inputs))`.
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(...inputs);
}
