import Link from "next/link";
import styles from "./page.module.scss";
import OfflineDownload from "@/components/OfflineDownload";

export default function Home() {
  return (
    <main className={styles.main}>
      <Link className={styles.title} href="/">
        <img src="/images/blacksmith.png" alt="Blacksmith" />
      </Link>

      <hr className="border" />

      <div className={styles.menuWrapper}>
        <div className={styles.menu}>
          <ul>
            <li>
              <Link href="/blacksmith/">Weapons</Link>
            </li>
            <li>
              <Link href="/armorsmith/">Armor</Link>
            </li>
            <li>
              <Link href="/decorations/">Decorations</Link>
            </li>
            <li>
              <Link href="/monsters/">Monsters</Link>
            </li>
            <li>
              <Link href="/hunter/">Hunter Profile</Link>
            </li>
            <li aria-disabled="true">Options</li>
          </ul>
        </div>
      </div>

      <OfflineDownload />
    </main>
  );
}
