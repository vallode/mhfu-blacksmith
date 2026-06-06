import { WEAPON_TYPES, type WeaponType } from "@/lib/constants";
import styles from "@/styles/weapon-tree.module.scss";

interface WeaponNavProps {
  activeType?: WeaponType;
}

function formatWeaponName(type: string): string {
  return type.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function WeaponNav({ activeType }: WeaponNavProps) {
  return (
    <nav className={styles["weapon-navigation"]}>
      <div>
        <a href="/blacksmith/">
          <div className="icon icon--nav">
            <img src="/images/arrow.png" alt="Back" />
          </div>
        </a>
      </div>

      {WEAPON_TYPES.map((type) => {
        const name = formatWeaponName(type);
        return (
          <div key={type}>
            <a href={`/blacksmith/${type}/`} title={name}>
              <div
                className={[
                  "icon icon--nav icon--large",
                  `icon--${type}`,
                  activeType === type ? "icon--rarity-4" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                <img src={`/images/${type}.png`} alt={name} />
              </div>
            </a>
          </div>
        );
      })}

      <div className="search-trigger-wrap">
        <button className="search-trigger" aria-label="Search">
          <img src="/images/binoculars.png" alt="Search" />
        </button>
      </div>
    </nav>
  );
}
