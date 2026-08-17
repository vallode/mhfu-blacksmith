"use client";

import Link from "next/link";
import Card from "@/components/Card";
import Icon from "@/components/Icon";
import listStyles from "@/styles/list-page.module.scss";
import type { MonsterCategory } from "@/lib/constants";
import { useMonsterList } from "@/lib/client-data";

interface Props {
  category: MonsterCategory;
}

function formatName(category: string): string {
  return category.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function MonsterListClient({ category }: Props) {
  const { items, loading } = useMonsterList(category);
  const name = formatName(category);

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
          {!loading &&
            items?.map((monster) => (
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
