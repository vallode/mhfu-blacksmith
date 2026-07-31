import Link from "next/link";
import { ARMOR_SLOTS, ARMOR_RANKS } from "@/lib/constants";
import type { Metadata } from "next";
import Card from "@/components/Card";
import Icon from "@/components/Icon";

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
        {ARMOR_SLOTS.map((slot) => (
          <div key={slot}>
            <Card className="blacksmith-page__table">
              <p>{formatLabel(slot)}</p>
              {ARMOR_RANKS.map((rank) => (
                <Link key={rank} href={`/armorsmith/${slot}/${rank}/`} className="row">
                  <Icon type={slot} size="large" alt={slot} />
                  <p>{formatLabel(rank)}</p>
                </Link>
              ))}
            </Card>
          </div>
        ))}
      </div>
    </>
  );
}
