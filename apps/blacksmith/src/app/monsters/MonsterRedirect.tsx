"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { readLastMonster } from "@/lib/last-monster";

/** `/monsters/` has no page of its own: it sends you to the monster type you last viewed. */
export default function MonsterRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/monsters/${readLastMonster()}/`);
  }, [router]);
  return null;
}
