import { clsx, type ClassValue } from "clsx";

/**
 * Merge conditional class names.
 *
 * Accepts strings, arrays, and `{ className: condition }` objects; falsy
 * values are dropped. A plain clsx wrapper for now; once components are
 * mostly Tailwind utilities, consider `twMerge(clsx(inputs))` so a passed-in
 * className can override a conflicting default.
 */
export function cn(...inputs: ClassValue[]): string {
  return clsx(...inputs);
}
