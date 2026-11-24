"use client";

/**
 * A saved set's name field: in "My sets" when renaming one, and in the
 * editor's title bar. Submitting a non-empty name calls `onSubmit`; Escape
 * cancels.
 */
import { useState } from "react";
import { useT } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";
import { MAX_NAME } from "@/lib/set-codec";
import * as ui from "@/styles/settings";

export default function SetNameForm({
  initial,
  label,
  onSubmit,
  onCancel,
  className,
}: {
  initial: string;
  /** The input's aria-label ("Set name"). */
  label: string;
  onSubmit: (name: string) => void;
  onCancel: () => void;
  className?: string;
}) {
  const t = useT();
  const [name, setName] = useState(initial);
  return (
    <form
      className={cn("flex min-w-0 gap-[0.8rem]", className)}
      onSubmit={(e) => {
        e.preventDefault();
        const trimmed = name.trim();
        if (trimmed) onSubmit(trimmed);
        else onCancel();
      }}
    >
      <input
        className={cn(ui.searchInput, "min-w-0")}
        aria-label={label}
        value={name}
        maxLength={MAX_NAME}
        autoFocus
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Escape" && onCancel()}
      />
      <button type="submit" className={ui.button}>
        {t.setBuilder.mySets.ok}
      </button>
    </form>
  );
}
