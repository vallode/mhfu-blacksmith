"use client";

import StepSelector from "@/components/StepSelector";
import { useLocale, useT } from "@/context/LanguageContext";

/**
 * A setting of a motion value view as the game's "◀ Label: option 2/3 ▶"
 * selector: Demon Mode, sharpness, hitzone, monster type.
 */
export default function Choice({
  label,
  options,
  index,
  onChange,
  hideCount,
}: {
  label: string;
  options: React.ReactNode[];
  index: number;
  onChange: (index: number) => void;
  /** Leave out the "2/7" count (a long run of values, like the hitzone's). */
  hideCount?: boolean;
}) {
  const tm = useT().motionValues;
  const { formatNumber } = useLocale();
  return (
    <StepSelector
      groupLabel={label}
      previousLabel={tm.previous}
      nextLabel={tm.next}
      index={index}
      count={options.length}
      countLabel={tm.of(formatNumber(index + 1), formatNumber(options.length))}
      onChange={onChange}
      hideCount={hideCount}
      label={
        <>
          <span className="flex-none text-warm">{label}</span>
          <span className="min-w-0 truncate">{options[index]}</span>
        </>
      }
    />
  );
}
