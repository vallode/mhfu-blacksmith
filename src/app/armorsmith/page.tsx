import Link from "next/link";
import { ARMOR_SLOTS, ARMOR_RANKS } from "@/lib/constants";
import type { Metadata } from "next";
import Card from "@/components/Card";
import Icon from "@/components/Icon";
import listStyles from "@/styles/list-page.module.scss";

export const metadata: Metadata = {
  title: "Armor — MHFU Blacksmith",
};

function formatLabel(s: string): string {
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ArmorsmithPage() {
  return (
    <>
      <nav className="flex w-full items-center justify-start max-[600px]:flex-wrap max-[600px]:justify-center">
        <div>
          <Link href="/" aria-label="Back">
            <Icon type="arrow" nav alt="Back" />
          </Link>
        </div>
        <div className="ml-auto">
          <button
            className="search-trigger flex h-[52px] w-[52px] cursor-pointer items-center border-none bg-transparent p-0 text-white/60 hover:text-white [&>img]:h-full"
            aria-label="Search"
          >
            <img src="/images/binoculars.png" alt="Search" />
          </button>
        </div>
      </nav>

      <hr className="border" />

      <div className="flex h-full w-full flex-wrap justify-center gap-[1.3rem] overflow-auto">
        {ARMOR_SLOTS.map((slot) => (
          <div key={slot}>
            <Card className={listStyles.table}>
              <p>{formatLabel(slot)}</p>
              {ARMOR_RANKS.map((rank) => (
                <Link key={rank} href={`/armorsmith/${slot}/${rank}/`} className="list-row">
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
