"use client";

import { useEffect } from "react";
import { MONSTER_CATEGORIES, type MonsterCategory } from "@/lib/constants";
import { writeLastMonster } from "@/lib/last-monster";
import PageBar, { PageTab, PageTabs } from "./PageBar";

interface MonsterNavProps {
  activeCategory?: MonsterCategory;
}

function formatName(category: string): string {
  return category.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The bestiary's PageBar: one tab per monster type. */
export default function MonsterNav({ activeCategory }: MonsterNavProps) {
  // Remember the monster type so the main menu's "Monsters" entry reopens it.
  useEffect(() => {
    if (activeCategory) writeLastMonster(activeCategory);
  }, [activeCategory]);

  return (
    <PageBar
      title={activeCategory ? `${formatName(activeCategory)} monsters` : "Monsters"}
      tabs={
        <PageTabs label="Monster types">
          {MONSTER_CATEGORIES.map((category) => (
            <PageTab
              key={category}
              href={`/monsters/${category}/`}
              label={formatName(category)}
              icon={category}
              monster
              active={activeCategory === category}
            />
          ))}
        </PageTabs>
      }
    />
  );
}
