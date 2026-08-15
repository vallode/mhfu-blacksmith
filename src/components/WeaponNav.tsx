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
    <nav className="flex w-full items-center justify-start max-[600px]:flex-wrap max-[600px]:justify-center">
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

      <div className="ml-auto">
        <button
          className="search-trigger flex h-[52px] w-[52px] cursor-pointer items-center border-none bg-none p-0 text-white/60 hover:text-white [&>img]:h-full"
          aria-label="Search"
        >
          <img src="/images/binoculars.png" alt="Search" />
        </button>
      </div>
    </nav>
  );
}
