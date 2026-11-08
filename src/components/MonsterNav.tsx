"use client";

import { useEffect } from "react";
import Link from "next/link";
import { MONSTER_CATEGORIES, type MonsterCategory } from "@/lib/constants";
import { writeLastMonster } from "@/lib/last-monster";
import Icon from "./Icon";

function formatName(category: string): string {
  return category.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Top bar for the bestiary: back arrow plus one icon per monster type. */
export default function MonsterNav({ activeCategory }: { activeCategory?: MonsterCategory }) {
  // Remember the monster type so the main menu's "Monsters" entry reopens it.
  useEffect(() => {
    if (activeCategory) writeLastMonster(activeCategory);
  }, [activeCategory]);

  return (
    <nav className="flex w-full items-center justify-start mobile:flex-wrap mobile:justify-center">
      <div>
        <Link href="/" aria-label="Back">
          <Icon type="arrow" nav alt="Back" />
        </Link>
      </div>

      {MONSTER_CATEGORIES.map((category) => {
        const name = formatName(category);
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
