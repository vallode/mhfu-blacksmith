"use client";

import Link from "next/link";
import Card from "@/components/Card";
import Icon from "@/components/Icon";
import type { MonsterCategory } from "@/lib/constants";
import { useMonsterList } from "@/lib/client-data";

interface Props {
  category: MonsterCategory;
}

/** The monsters of one type. The nav above it comes from the monsters layout (MonsterShell). */
export default function MonsterListClient({ category }: Props) {
  const { items, loading } = useMonsterList(category);

  return (
    <div className="flex h-full w-full flex-wrap justify-center gap-[1.3rem] overflow-auto">
      <Card className="overflow-auto py-7">
        {!loading &&
          items?.map((monster) => (
            <Link
              key={monster.slug}
              href={`/monsters/${category}/${monster.slug}/`}
              className="list-row"
            >
              <Icon type={category} monster alt={monster.name} />
              <p>{monster.name}</p>
            </Link>
          ))}
      </Card>
    </div>
  );
}
