import { cn } from "@/lib/cn";

/** The game's star sprite that marks gear on the wishlist: grey until it's listed. */
export default function WishlistStar({ lit, className }: { lit: boolean; className?: string }) {
  return (
    <img
      src="/images/star.png"
      alt=""
      className={cn(
        "aspect-[13/14] w-[2.6rem] pixelated",
        !lit && "opacity-45 grayscale",
        className,
      )}
    />
  );
}
