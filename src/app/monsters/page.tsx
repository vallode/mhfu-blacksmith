import Link from "next/link";
import { MONSTER_CATEGORIES } from "@/lib/constants";
import type { Metadata } from "next";

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
          {MONSTER_CATEGORIES.map((category) => (
            <Link
              key={category}
              href={`/monsters/${category}/`}
              className="row"
            >
              <div className={`icon icon--large icon--${category}`}>
                <img src={`/images/monsters/${category}.png`} alt={category} />
              </div>
              <p>{formatLabel(category)}</p>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
