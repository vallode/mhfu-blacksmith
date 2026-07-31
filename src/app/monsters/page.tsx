import Link from "next/link";
import { MONSTER_CATEGORIES } from "@/lib/constants";
import type { Metadata } from "next";
import Card from "@/components/Card";
import Icon from "@/components/Icon";

export const metadata: Metadata = {
  title: "Bestiary — MHFU Blacksmith",
};

function formatLabel(s: string): string {
  return s.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function BestiaryPage() {
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
          {MONSTER_CATEGORIES.map((category) => (
            <Link
              key={category}
              href={`/monsters/${category}/`}
              className="row"
            >
              <Icon type={category} size="large" monster alt={category} />
              <p>{formatLabel(category)}</p>
            </Link>
          ))}
        </Card>
      </div>
    </>
  );
}
