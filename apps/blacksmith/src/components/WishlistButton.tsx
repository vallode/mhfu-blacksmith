"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/context/LanguageContext";
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
  /** The gear's name in the site's language, for the toast */
  name: string;
  className?: string;
}) {
  const wishlist = useWishlist();
  const { toast } = useToast();
  const router = useRouter();
  const tw = useT().equipment.wishlist;
  // Nothing to show until storage has been read (not while prerendering).
  if (!wishlist.entries) return null;
  const listed = wishlist.has(gear);
  const label = listed ? tw.remove : tw.add;

  const onClick = () => {
    if (!wishlist.toggle(gear)) {
      toast({ id: "wishlist", message: tw.saveFailed });
      return;
    }
    toast({
      id: "wishlist",
      message: listed ? tw.removed(name) : tw.added(name),
      duration: 3000,
      actions: listed ? undefined : [{ label: tw.view, onClick: () => router.push("/wishlist/") }],
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
