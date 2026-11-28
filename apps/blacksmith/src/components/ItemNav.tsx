"use client";

import { useT } from "@/context/LanguageContext";
import { SITE_GAME } from "@/lib/constants";
import PageBar, { PageTab, PageTabs } from "./PageBar";

/**
 * The Items section's PageBar: the item list and the Veggie Elder's trades,
 * which the sidebar reaches through its one Items entry.
 */
export default function ItemNav({ active }: { active: "items" | "veggie-elder" }) {
  const t = useT();
  const nav = t.site.nav;
  return (
    <PageBar
      title={active === "items" ? nav.items : nav.veggieElder}
      tabs={
        <PageTabs label={t.items.list.pages}>
          <PageTab href="/items/" label={nav.items} icon="fluid" active={active === "items"} />
          {SITE_GAME.sections.veggieElder && (
            <PageTab
              href="/veggie-elder/"
              label={nav.veggieElder}
              icon="mushroom"
              active={active === "veggie-elder"}
            />
          )}
        </PageTabs>
      }
    />
  );
}
