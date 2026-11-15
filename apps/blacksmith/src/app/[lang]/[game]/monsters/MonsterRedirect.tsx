"use client";

import { usePaths } from "@/context/SiteContext";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { readLastMonster } from "@/lib/last-monster";

/** `/monsters/` has no page of its own: it sends you to the monster type you last viewed. */
export default function MonsterRedirect() {
  const paths = usePaths();
  const router = useRouter();
  useEffect(() => {
    router.replace(paths.monsters(readLastMonster()));
  }, [router, paths]);
  return null;
}
