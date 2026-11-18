import type { Locale } from "../locales";
import { en, type Messages } from "./en";
import { es } from "./es";

export type { Messages } from "./en";

/** Every language's interface text. Small enough to ship together. */
export const MESSAGES: Record<Locale, Messages> = { en, es };
