"use client";

import { cn } from "@/lib/cn";
import { useT } from "@/context/LanguageContext";

interface SharpnessBarProps {
  values: (string | number)[];
  plus?: boolean;
}

export default function SharpnessBar({ values, plus }: SharpnessBarProps) {
  const t = useT();
  const title = plus ? t.equipment.detail.sharpnessPlus : t.equipment.detail.sharpness;

  return (
    <div
      className={cn(
        "relative ml-auto flex h-6 w-49 px-2 py-[6px] mobile:mx-auto",
        // The bar's pixel-art frame is drawn on top of the colour segments.
        "after:absolute after:top-0 after:left-0 after:z-10 after:size-full after:bg-cover after:pixelated",
        plus
          ? "after:bg-[url(/images/sharpness-plus.png)]"
          : "after:bg-[url(/images/sharpness.png)]",
      )}
      title={title}
      tabIndex={plus ? 1 : 0}
    >
      {values.map((v, i) => (
        <span
          key={i}
          className="z-1 inline-block h-full"
          style={{
            backgroundColor: `var(--color-sharpness-${i + 1})`,
            width: `${Number(v) * 4}px`,
          }}
        />
      ))}
    </div>
  );
}
