"use client";

import Link from "next/link";
import Card from "@/components/Card";
import Icon from "@/components/Icon";
import type { MonsterCategory } from "@/lib/constants";
import { useMonsterList } from "@/lib/client-data";
import MonsterNav from "@/components/MonsterNav";
import BorderRule from "@/components/BorderRule";

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
      <MonsterNav activeCategory={category} />
      <BorderRule />

      <div className="flex h-full w-full flex-wrap justify-center gap-[1.3rem] overflow-auto">
        <Card className="overflow-auto py-7">
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
