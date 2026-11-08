import Link from "next/link";
import { MONSTER_CATEGORIES, type MonsterCategory } from "@/lib/constants";
import Icon from "./Icon";

function formatName(category: string): string {
  return category.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Top bar for the bestiary: back arrow plus one icon per monster type. */
export default function MonsterNav({ activeCategory }: { activeCategory?: MonsterCategory }) {
  return (
    <nav className="flex w-full items-center justify-start mobile:flex-wrap mobile:justify-center">
      <div>
        <Link href="/monsters/" aria-label="Back">
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
