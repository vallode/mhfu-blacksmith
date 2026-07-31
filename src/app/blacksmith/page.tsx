import Link from "next/link";
import { WEAPON_TYPES } from "@/lib/constants";
import type { Metadata } from "next";
import Card from "@/components/Card";
import Icon from "@/components/Icon";

export const metadata: Metadata = {
  title: "Weapon Trees — MHFU Blacksmith",
  description:
    "Monster Hunter Freedom Unite weapon trees. 11 types of weapons in the Blademaster and Gunner categories.",
};

function formatWeaponName(type: string): string {
  return type.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function BlacksmithPage() {
  return (
    <>
      <nav className="weapon-navigation">
        <div>
          <Link href="/" aria-label="Back">
            <Icon type="arrow" nav alt="Back" />
          </Link>
        </div>
        <div className="search-trigger-wrap">
          <button className="search-trigger" aria-label="Search">
            <img src="/images/binoculars.png" alt="Search" />
          </button>
        </div>
      </nav>

      <hr className="border" />

      <div className="blacksmith-page">
        <Card className="blacksmith-page__table">
          {WEAPON_TYPES.map((type) => {
            const name = formatWeaponName(type);
            return (
              <Link
                key={type}
                href={`/blacksmith/${type}/`}
                className="row"
              >
                <Icon type={type} size="large" rarity={4} alt={name} />
                <p>{name}</p>
              </Link>
            );
          })}
        </Card>
      </div>
    </>
  );
}
