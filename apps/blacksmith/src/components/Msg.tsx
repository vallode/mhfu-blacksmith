"use client";

/**
 * One interface string, for server components that can't call `useT()`:
 * `<Msg k="common.sections.weapons" />`. Client components use `useT()`.
 */
import { useT } from "@/context/LanguageContext";
import type { Messages } from "@/lib/i18n/messages";

/** Dotted paths to the plain-string entries of `T`. */
type StringPaths<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : T[K] extends (...args: never[]) => unknown
      ? never
      : T[K] extends object
        ? StringPaths<T[K], `${Prefix}${K}.`>
        : never;
}[keyof T & string];

export type MessageKey = StringPaths<Messages>;

export function lookup(messages: Messages, key: MessageKey): string {
  let node: unknown = messages;
  for (const part of key.split(".")) node = (node as Record<string, unknown>)[part];
  return typeof node === "string" ? node : key;
}

export default function Msg({ k }: { k: MessageKey }) {
  return lookup(useT(), k);
}
