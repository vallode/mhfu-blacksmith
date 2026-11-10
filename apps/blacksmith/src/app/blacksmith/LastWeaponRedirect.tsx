"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { readLastWeapon } from "@/lib/last-weapon";

/** `/blacksmith/` has no page of its own: it sends you to the weapon type you last viewed. */
export default function LastWeaponRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/blacksmith/${readLastWeapon()}/`);
  }, [router]);
  return null;
}
