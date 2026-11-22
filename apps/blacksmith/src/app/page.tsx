import { DEFAULT_WEAPON } from "@/lib/last-weapon";
import { WeaponShell } from "./blacksmith/WeaponShell";
import LastWeaponRedirect from "./blacksmith/LastWeaponRedirect";
import WeaponTreeListClient from "./blacksmith/[type]/WeaponTreeListClient";

/**
 * The site has no main page: `/` opens the weapon type you last viewed. It is
 * built as the default type's (Great Sword's) tree page, the one a first
 * visit opens, so that paints without waiting for a redirect.
 */
export default function Home() {
  return (
    <WeaponShell type={DEFAULT_WEAPON}>
      <WeaponTreeListClient type={DEFAULT_WEAPON} />
      <LastWeaponRedirect />
    </WeaponShell>
  );
}
