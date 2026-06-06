import { ARMOR_SLOTS, ARMOR_RANKS } from "@/lib/constants";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Armor — MHFU Blacksmith",
};

function formatLabel(s: string): string {
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ArmorsmithPage() {
  return (
    <>
      <nav className="weapon-navigation">
        <div>
          <a href="/">
            <div className="icon icon--nav">
              <img src="/images/arrow.png" alt="Back" />
            </div>
          </a>
        </div>
        <div className="search-trigger-wrap">
          <button className="search-trigger" aria-label="Search">
            <img src="/images/binoculars.png" alt="Search" />
          </button>
        </div>
      </nav>

      <hr className="border" />

      <div className="blacksmith-page">
        {ARMOR_SLOTS.map((slot) => (
          <div key={slot}>
            <div className="card blacksmith-page__table">
              <p>{formatLabel(slot)}</p>
              {ARMOR_RANKS.map((rank) => (
                <a key={rank} href={`/armorsmith/${slot}/${rank}/`} className="row">
                  <div className={`icon icon--large icon--${slot}`}>
                    <img src={`/images/${slot}.png`} alt={slot} />
                  </div>
                  <p>{formatLabel(rank)}</p>
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
