import { cn } from "@/lib/cn";

interface LoadingProps {
  /** Status text shown next to the animation, e.g. "Loading model…". */
  children: React.ReactNode;
  className?: string;
}

/**
 * The in-game running loading animation next to a status message. The
 * animation fades in after a short delay (animate-loading-in), so a load
 * that finishes quickly only ever shows the text. It's hidden for reduced
 * motion, since a GIF can't be paused.
 */
export default function Loading({ children, className }: LoadingProps) {
  return (
    <div role="status" className={cn("flex items-center gap-4", className)}>
      <img
        src="/images/loading.gif"
        alt=""
        width={56}
        height={72}
        className="h-[7.2rem] w-[5.6rem] flex-none animate-loading-in pixelated motion-reduce:hidden"
      />
      <p>{children}</p>
    </div>
  );
}
