import Link from "next/link";
import { WEAPON_TYPES, type WeaponType } from "@/lib/constants";
import Icon from "./Icon";

interface WeaponNavProps {
  activeType?: WeaponType;
}

function formatWeaponName(type: string): string {
  return type.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function WeaponNav({ activeType }: WeaponNavProps) {
  return (
    <nav className="weapon-navigation">
      <div>
        <Link href="/blacksmith/" aria-label="Back">
          <Icon type="arrow" nav alt="Back" />
        </Link>
      </div>

      {WEAPON_TYPES.map((type) => {
        const name = formatWeaponName(type);
        return (
          <div key={type}>
            <Link href={`/blacksmith/${type}/`} title={name}>
              <Icon
                type={type}
                size="large"
                nav
                active={activeType === type}
                alt={name}
              />
            </Link>
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
