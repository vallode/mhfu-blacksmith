"use client";

/**
 * The set search's button, in a bar that sticks above the phone's tab bar
 * (and to the bottom of the window elsewhere). It says what it will do
 * ("Search 3 skills", "Update results") and turns into progress and Cancel
 * while the search runs. Hidden while the results match the form.
 */
import { useLocale, useT } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";
import { primaryButton, secondaryButton } from "@/styles/set-builder";

export default function SearchBar({
  searching,
  found,
  stale,
  hasResult,
  skillCount,
  ready,
  onSearch,
  onCancel,
}: {
  searching: boolean;
  /** Sets found so far by the running search. */
  found: number;
  /** The form asks for something other than the results show. */
  stale: boolean;
  /** Results are showing (so a new search updates them). */
  hasResult: boolean;
  skillCount: number;
  /** The armor data has loaded. */
  ready: boolean;
  onSearch: () => void;
  onCancel: () => void;
}) {
  const text = useT().setBuilder;
  const { formatNumber } = useLocale();
  if (!searching && !stale) return null;
  return (
    <div className="sticky bottom-[1.6rem] z-20 flex gap-[0.8rem] min-[900px]:static min-[900px]:col-start-1 min-[900px]:row-start-2 mobile:bottom-[calc(var(--spacing-tabbar)+env(safe-area-inset-bottom)+0.8rem)]">
      {searching ? (
        <>
          <div
            role="status"
            className={cn(primaryButton, "cursor-default border-white/40 bg-line")}
          >
            <img src="/images/loading.gif" alt="" className="h-[2.4rem] w-auto" />
            {text.searchBar.searching(
              found > 0 ? <span className="text-stat">{formatNumber(found)}</span> : null,
            )}
          </div>
          <button type="button" className={secondaryButton} onClick={onCancel}>
            {text.form.cancel}
          </button>
        </>
      ) : (
        <button type="button" className={primaryButton} disabled={!ready} onClick={onSearch}>
          {hasResult ? text.searchBar.update : text.searchBar.search(skillCount)}
        </button>
      )}
    </div>
  );
}
