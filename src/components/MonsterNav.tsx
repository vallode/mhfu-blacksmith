"use client";

import { useEffect } from "react";
import Link from "next/link";
import { MONSTER_CATEGORIES, type MonsterCategory } from "@/lib/constants";
import { writeLastMonster } from "@/lib/last-monster";
import { useT } from "@/context/LanguageContext";
import Icon from "./Icon";

/** Top bar for the bestiary: back arrow plus one icon per monster type. */
export default function MonsterNav({ activeCategory }: { activeCategory?: MonsterCategory }) {
  const t = useT();
  // Remember the monster type so the main menu's "Monsters" entry reopens it.
  useEffect(() => {
    if (activeCategory) writeLastMonster(activeCategory);
  }, [activeCategory]);

  return (
    <nav className="flex w-full items-center justify-start mobile:flex-wrap mobile:justify-center">
      <div>
        <Link href="/" aria-label={t.common.back}>
          <Icon type="arrow" nav alt={t.common.back} />
        </Link>
      </div>

      {MONSTER_CATEGORIES.map((category) => {
        const name = t.common.monsterCategories[category];
        return (
          <div key={category}>
            <Link href={`/monsters/${category}/`} title={name}>
              <Icon
                type={category}
                size="large"
                monster
                nav
                active={activeCategory === category}
                alt={name}
              />
            </Link>
          </div>
        );
      })}
    </nav>
  );
}
