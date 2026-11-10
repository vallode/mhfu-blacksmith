"use client";

import { useEffect } from "react";
import { MONSTER_CATEGORIES, type MonsterCategory } from "@/lib/constants";
import { writeLastMonster } from "@/lib/last-monster";
import PageBar, { PageTab, PageTabs } from "./PageBar";

interface MonsterNavProps {
  activeCategory?: MonsterCategory;
  /** On a monster's page: phones show only the detail, so lead back to the list. */
  detail?: boolean;
}

function formatName(category: string): string {
  return category.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** The bestiary's PageBar: one tab per monster type. */
export default function MonsterNav({ activeCategory, detail }: MonsterNavProps) {
  // Remember the monster type so the main menu's "Monsters" entry reopens it.
  useEffect(() => {
    if (activeCategory) writeLastMonster(activeCategory);
  }, [activeCategory]);

  const categoryName = activeCategory && formatName(activeCategory);

  return (
    <PageBar
      title={categoryName ? `${categoryName} monsters` : "Monsters"}
      back={
        detail && activeCategory
          ? { href: `/monsters/${activeCategory}/`, label: `${categoryName} list` }
          : undefined
      }
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
