"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useT } from "@/context/LanguageContext";
import WishlistStar from "@/components/WishlistStar";
import { useToast } from "@/context/ToastContext";
import { cn } from "@/lib/cn";
import type { BuildSet } from "@/lib/set-build";
import type { ArmorSet } from "@/lib/set-search";
import { setWants } from "@/lib/wishlist";
import { useWishlist } from "@/lib/wishlist-store";
import { secondaryButton } from "@/styles/set-builder";

/**
 * Puts a whole set on the wishlist: every piece, and every jewel with as many
 * as the set uses. Once it's all there (a jewel at least that many times), the
 * button turns into a link to the wishlist.
 */
export default function SetWishlistButton({
  set,
  className,
}: {
  set: Pick<ArmorSet, "pieces" | "decorations"> | Pick<BuildSet, "pieces" | "decorations">;
  className?: string;
}) {
  const wishlist = useWishlist();
  const { toast } = useToast();
  const router = useRouter();
  const t = useT();
  const text = t.setBuilder.result;
  const tw = t.equipment.wishlist;
  const wants = useMemo(() => setWants(set), [set]);
  // Nothing to show until storage has been read, or for a set with nothing in it.
  if (!wishlist.entries || wants.length === 0) return null;

  const star = (lit: boolean) => <WishlistStar lit={lit} className="w-[2.2rem]" />;
  const button = cn(secondaryButton, "gap-[0.8rem] self-start no-underline", className);

  if (wishlist.hasAll(wants)) {
    return (
      <Link href="/wishlist/" className={cn(button, "border-stat/60 text-white")}>
        {star(true)}
        {text.onWishlist}
      </Link>
    );
  }

  const onClick = () => {
    const changed = wishlist.addAll(wants);
    if (changed === null) {
      toast({ id: "wishlist", message: tw.saveFailed });
      return;
    }
    if (changed === 0) return;
    toast({
      id: "wishlist",
      message: wants.some((w) => w.kind === "decoration") ? text.setAddedWithJewels : text.setAdded,
      duration: 3000,
      actions: [{ label: tw.view, onClick: () => router.push("/wishlist/") }],
    });
  };

  return (
    <button type="button" className={button} onClick={onClick}>
      {star(false)}
      {text.addToWishlist}
    </button>
  );
}
