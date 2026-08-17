import Link from "next/link";
import { notFound } from "next/navigation";
import { getMonsterCategories, getMonsters } from "@/lib/monsters";
import { MONSTER_CATEGORIES, type MonsterCategory } from "@/lib/constants";
import Card from "@/components/Card";
import Icon from "@/components/Icon";
import listStyles from "@/styles/list-page.module.scss";
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
      <nav className="flex w-full items-center justify-start max-[600px]:flex-wrap max-[600px]:justify-center">
        <div>
          <Link href="/monsters/" aria-label="Back">
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
        <Card className={listStyles.table}>
          <p>{name}</p>
          {monsters.map((monster) => (
            <Link
              key={monster.slug}
              href={`/monsters/${category}/${monster.slug}/`}
              className="list-row"
            >
              <Icon type={category} size="large" monster alt={monster.name} />
              <p>{monster.name}</p>
            </Link>
          ))}
        </Card>
      </div>
    </>
  );
}
