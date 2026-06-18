import styles from "./page.module.scss";

export default function Home() {
  return (
    <main className={styles.main}>
      <a className={styles.title} href="/">
        <img src="/images/blacksmith.png" alt="Blacksmith" />
      </a>

      <hr className="border" />

      <div className={styles.menuWrapper}>
        <div className={styles.menu}>
          <ul>
            <li>
              <a href="/blacksmith/">Weapons</a>
            </li>
            <li>
              <a href="/armorsmith/">Armor</a>
            </li>
            <li>
              <a href="/decorations/">Decorations</a>
            </li>
            <li>
              <a href="/monsters/">Monsters</a>
            </li>
            <li aria-disabled="true">Options</li>
            {/* <li>
              <a href="//github.com/vallode/mhfu-blacksmith">Source Code</a>
            </li> */}
          </ul>
        </div>
      </div>
    </main>
  );
}
