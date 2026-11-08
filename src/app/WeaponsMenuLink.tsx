"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { DEFAULT_WEAPON, readLastWeapon } from "@/lib/last-weapon";

/** The "Weapons" menu entry: opens the weapon type the user last viewed (Great Sword at first). */
export default function WeaponsMenuLink({ className }: { className?: string }) {
  // The server-rendered page has no stored choice, so start on the default and switch after mount.
  const [type, setType] = useState<string>(DEFAULT_WEAPON);
  useEffect(() => setType(readLastWeapon()), []);

  return (
    <Link className={className} href={`/blacksmith/${type}/`}>
      Weapons
    </Link>
  );
}
