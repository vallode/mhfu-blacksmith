"use client";

import { useRouter } from "next/navigation";
import { useToast } from "@/context/ToastContext";
import { cn } from "@/lib/cn";
import type { GearRef } from "@/lib/wishlist";
import { useWishlist } from "@/lib/wishlist-store";

/**
 * Adds the gear to the wishlist or takes it off: the game's star sprite
 * beside the item's name, grey until it's listed. Pulses green on hover like
 * the model button beside it.
 */
export default function WishlistButton({
  gear,
  name,
  className,
}: {
  gear: GearRef;
  /** The gear's name, for the toast */
  name: string;
  className?: string;
}) {
  const wishlist = useWishlist();
  const { toast } = useToast();
  const router = useRouter();
  // Nothing to show until storage has been read (not while prerendering).
  if (!wishlist.entries) return null;
  const listed = wishlist.has(gear);
  const label = listed ? "Remove from wishlist" : "Add to wishlist";

  const onClick = () => {
    if (!wishlist.toggle(gear)) {
      toast({ id: "wishlist", message: "Couldn't save the wishlist in this browser." });
      return;
    }
    toast({
      id: "wishlist",
      message: listed ? `${name} taken off your wishlist.` : `${name} added to your wishlist.`,
      duration: 3000,
      actions: listed ? undefined : [{ label: "View", onClick: () => router.push("/wishlist/") }],
    });
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={listed}
      aria-label={label}
      title={label}
      className={cn(
        "flex flex-none cursor-pointer items-center px-[0.8rem] py-[0.4rem] hover:hover-glow focus-visible:hover-glow",
        className,
      )}
    >
      <img
        src="/images/star.png"
        alt=""
        className={cn(
          "aspect-[13/14] w-[2.6rem] pixelated",
          !listed && "opacity-45 grayscale hover:opacity-80",
        )}
      />
    </button>
  );
}
