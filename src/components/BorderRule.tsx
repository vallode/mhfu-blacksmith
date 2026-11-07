import { cn } from "@/lib/cn";

interface BorderRuleProps {
  className?: string;
}

/**
 * Decorative tiled horizontal divider shown under page headers.
 *
 * It bleeds out to both edges of the window whatever padding its ancestors
 * have: a 100vw box re-centred on its container by a percentage margin
 * (percentages resolve against the container width). 100vw includes the
 * scrollbar, so `html` clips horizontal overflow (see globals.scss).
 */
export default function BorderRule({ className }: BorderRuleProps) {
  return (
    <hr
      className={cn(
        "divider-tile mx-[calc(50%-50vw)] h-[1.6rem] w-screen flex-[0_0_auto] border-0 bg-transparent",
        className,
      )}
    />
  );
}
