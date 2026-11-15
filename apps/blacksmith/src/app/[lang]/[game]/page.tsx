import LastWeaponRedirect from "./blacksmith/LastWeaponRedirect";

/** The site has no main page: `/` opens the weapon type you last viewed (Great Sword at first). */
export default function Home() {
  return <LastWeaponRedirect />;
}
