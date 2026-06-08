import Link from "next/link";
import { WEAPON_TYPES } from "@/lib/constants";
import type { Metadata } from "next";

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
          <Link href="/">
            <div className="icon icon--nav">
              <img src="/images/arrow.png" alt="Back" />
            </div>
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
        <div className="card blacksmith-page__table">
          {WEAPON_TYPES.map((type) => {
            const name = formatWeaponName(type);
            return (
              <Link key={type} href={`/blacksmith/${type}/`} className="row">
                <div
                  className={`icon icon--large icon--${type} icon--rarity-4`}
                >
                  <img src={`/images/${type}.png`} alt={name} />
                </div>
                <p>{name}</p>
              </Link>
            );
          })}
        </div>
      </div>
    </>
  );
}
