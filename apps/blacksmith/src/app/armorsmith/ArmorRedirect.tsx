"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { readLastArmor } from "@/lib/armor-last-store";

/**
 * /armorsmith/ has no content of its own: it forwards to the armor page the
 * hunter used last (helmet, low rank the first time).
 */
export default function ArmorRedirect() {
  const router = useRouter();

  useEffect(() => {
    const { slot, rank } = readLastArmor();
    router.replace(`/armorsmith/${slot}/${rank}/`);
  }, [router]);

  return null;
}
