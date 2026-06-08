import Link from "next/link";
import { notFound } from "next/navigation";
import { getMonsterCategories, getMonsters } from "@/lib/monsters";
import { MONSTER_CATEGORIES, type MonsterCategory } from "@/lib/constants";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ category: string }>;
}

export async function generateStaticParams() {
  return getMonsterCategories().map((category) => ({ category }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category } = await params;
  const name = category.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  return { title: `${name} — MHFU Blacksmith` };
}

export default async function MonsterListPage({ params }: Props) {
  const { category } = await params;

  if (!MONSTER_CATEGORIES.includes(category as MonsterCategory)) notFound();

  const monsters = getMonsters(category as MonsterCategory);
  const name = category.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

  return (
    <>
      <nav className="weapon-navigation">
        <div>
          <Link href="/monsters/">
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
          <p>{name}</p>
          {monsters.map((monster) => (
            <Link
              key={monster.slug}
              href={`/monsters/${category}/${monster.slug}/`}
              className="row"
            >
              <div className={`icon icon--large icon--monster icon--${category}`}>
                <img src={`/images/monsters/${category}.png`} alt={monster.name} />
              </div>
              <p>{monster.name}</p>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
