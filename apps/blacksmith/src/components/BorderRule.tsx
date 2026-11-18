import { cn } from "@/lib/cn";

interface BorderRuleProps {
  className?: string;
}

/**
 * Decorative tiled horizontal divider shown under page headers.
 *
 * It bleeds out to both edges of the page column (AppShell's size container)
 * whatever padding its ancestors have, plus the body's 1.4rem padding: a
 * 100cqw box re-centred on its container by a percentage margin (percentages
 * resolve against the container width). So it runs from the sidebar to the
 * window's edge, and edge to edge on phones. Without a container, cqw falls
 * back to the viewport; `html` clips any horizontal overflow (globals.css).
 */
export default function BorderRule({ className }: BorderRuleProps) {
  return (
    <hr
      className={cn(
        "mx-[calc(50%-50cqw-1.4rem)] h-[1.6rem] w-[calc(100cqw+2.8rem)] flex-[0_0_auto] border-0 bg-transparent divider-tile",
        className,
      )}
    />
  );
}
