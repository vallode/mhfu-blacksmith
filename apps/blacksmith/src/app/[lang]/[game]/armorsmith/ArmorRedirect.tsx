"use client";

import { usePaths } from "@/context/SiteContext";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { readLastArmor } from "@/lib/armor-last-store";

/**
 * /armorsmith/ has no content of its own: it forwards to the armor page the
 * hunter used last (helmet, low rank the first time).
 */
export default function ArmorRedirect() {
  const paths = usePaths();
  const router = useRouter();

  useEffect(() => {
    const { slot, rank } = readLastArmor();
    router.replace(paths.armor(slot, rank));
  }, [router, paths]);

  return null;
}
