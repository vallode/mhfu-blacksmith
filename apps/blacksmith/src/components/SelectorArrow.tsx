import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * The previous/next button of an in-game selector ("◀ Set 7 ▶"), using the
 * game's green arrow sprite (the nav's back arrow); `next` mirrors it. With
 * `href` it is a link (stepping to another page), otherwise a button. Size
 * and position come from `className`; the sprite fills its height less 2px.
 */
export default function SelectorArrow({
  next,
  label,
  className,
  ...action
}: {
  next?: boolean;
  label: string;
  className?: string;
} & ({ onClick: () => void; href?: never } | { href: string; onClick?: never })) {
  const classes = cn(
    "group m-0 flex cursor-pointer items-center justify-center border-0 bg-transparent p-0",
    "focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-white focus-visible:outline-solid",
    className,
  );
  const sprite = (
    <img
      className={cn(
        "h-[calc(100%-2px)] w-auto transition-[filter] duration-100 ease-[ease] pixelated group-hover:brightness-125 group-focus-visible:brightness-125",
        next && "-scale-x-100",
      )}
      src="/images/arrow.png"
      alt=""
      aria-hidden="true"
      decoding="sync"
    />
  );
  return action.href !== undefined ? (
    <Link href={action.href} className={classes} aria-label={label}>
      {sprite}
    </Link>
  ) : (
    <button type="button" className={classes} aria-label={label} onClick={action.onClick}>
      {sprite}
    </button>
  );
}
