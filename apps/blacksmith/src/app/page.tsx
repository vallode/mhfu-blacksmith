import { DefaultWeaponPage } from "./blacksmith/LastWeaponRedirect";

/**
 * The site has no main page: `/` opens the weapon type you last viewed. It is
 * built as the default type's (Great Sword's) tree page, the one a first
 * visit opens, so that paints without waiting for a redirect.
 */
export default function Home() {
  return <DefaultWeaponPage />;
}
