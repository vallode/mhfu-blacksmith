"use client";

import { useEffect } from "react";
import { MONSTER_CATEGORIES, type MonsterCategory } from "@/lib/constants";
import { writeLastMonster } from "@/lib/last-monster";
import { useT } from "@/context/LanguageContext";
import PageBar, { PageTab, PageTabs } from "./PageBar";

interface MonsterNavProps {
  activeCategory?: MonsterCategory;
}

/** The bestiary's PageBar: one tab per monster type. */
export default function MonsterNav({ activeCategory }: MonsterNavProps) {
  const t = useT();
  // Remember the monster type so the main menu's "Monsters" entry reopens it.
  useEffect(() => {
    if (activeCategory) writeLastMonster(activeCategory);
  }, [activeCategory]);

  return (
    <PageBar
      title={
        activeCategory
          ? t.monsters.nav.title(t.common.monsterCategories[activeCategory])
          : t.common.sections.monsters
      }
      tabs={
        <PageTabs label={t.monsters.nav.types}>
          {MONSTER_CATEGORIES.map((category) => (
            <PageTab
              key={category}
              href={`/monsters/${category}/`}
              label={t.common.monsterCategories[category]}
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
