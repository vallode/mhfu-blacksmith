"use client";

import { Fragment } from "react";
import { useT } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";
import type { InputButton, MoveInput } from "@/lib/move-inputs";

/**
 * The game's PSP button sprites, from the HUD sheet the text's `~B` icons
 * use (sprites 50-58, texture 0x8001: the second image of EU DATA.BIN file
 * 30, `system/resides.tmh`): △ ○ × 16x16, R and SELECT 20x16, the
 * analog stick 16x16. Drawn at 1x.
 */
const SPRITES: Record<InputButton, { src: string; width: string }> = {
  triangle: { src: "/images/button-triangle.png", width: "w-[16px]" },
  circle: { src: "/images/button-circle.png", width: "w-[16px]" },
  cross: { src: "/images/button-cross.png", width: "w-[16px]" },
  r: { src: "/images/button-r.png", width: "w-[20px]" },
  select: { src: "/images/button-select.png", width: "w-[20px]" },
  stick: { src: "/images/button-stick.png", width: "w-[16px]" },
};

/**
 * A move's input with the default controls, as the game's button icons:
 * buttons pressed together joined by "+", the steps of a combo by "›", a
 * held button after "Hold".
 */
export default function ButtonInput({
  input,
  className,
}: {
  input: MoveInput;
  className?: string;
}) {
  const t = useT().motionValues.input;
  // Inline, on one line: the icons keep their size (no flex shrinking, and
  // `max-w-none` over the reset's `max-width: 100%`), so the table's column
  // is as wide as the widest input.
  return (
    <span className={cn("whitespace-nowrap text-muted", className)}>
      {input.map((step, i) => (
        <Fragment key={i}>
          {i > 0 && (
            <span aria-hidden className="mx-[0.4rem]">
              ›
            </span>
          )}
          {step.hold && <span className="mr-[0.4rem]">{t.hold}</span>}
          {step.buttons.map((b, j) => (
            <Fragment key={j}>
              {j > 0 && (
                <span aria-hidden className="mx-[0.2rem]">
                  +
                </span>
              )}
              <img
                src={SPRITES[b].src}
                alt={t.buttons[b]}
                title={t.buttons[b]}
                className={cn(
                  "inline-block h-[16px] max-w-none align-[-0.2rem] pixelated",
                  SPRITES[b].width,
                )}
              />
            </Fragment>
          ))}
        </Fragment>
      ))}
    </span>
  );
}
