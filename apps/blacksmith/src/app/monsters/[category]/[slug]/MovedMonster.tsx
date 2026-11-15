"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** An old monster URL (`lib/moved-monsters.ts`): sends the visitor to its current page. */
export default function MovedMonster({ to }: { to: string }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(to);
  }, [router, to]);
  // Without JavaScript, the refresh does it.
  return <meta httpEquiv="refresh" content={`0; url=${to}`} />;
}
