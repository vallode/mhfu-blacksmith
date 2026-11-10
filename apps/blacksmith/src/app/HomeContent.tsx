"use client";

import Link from "next/link";
import BorderRule from "@/components/BorderRule";
import { useT } from "@/context/LanguageContext";
import type { Messages } from "@/lib/i18n/messages";
import MenuLink, { type MenuSection } from "./MenuLink";

type Section = keyof Messages["common"]["sections"];

// Entries with a `section` open the page last viewed there (see MenuLink).
const MENU: { href: string; label: Section; section?: MenuSection }[] = [
  { href: "/blacksmith/", label: "weapons", section: "weapons" },
  { href: "/armorsmith/", label: "armor", section: "armor" },
  { href: "/decorations/", label: "decorations" },
  { href: "/set-builder/", label: "setBuilder" },
  { href: "/monsters/", label: "monsters", section: "monsters" },
  { href: "/quests/", label: "quests" },
  { href: "/hunter/", label: "hunter" },
  { href: "/options/", label: "options" },
];

// A main-menu entry: large spaced capitals with a drop shadow that turns
// white with a red shadow and the green glow behind it on hover.
const menuItem = [
  "relative text-center text-[2.3em] leading-[1.5] tracking-[0.5ch] text-parchment uppercase text-shadow-[0.2rem_0.2rem_black]",
  "hover:text-white hover:text-shadow-[0.2rem_0.2rem_#ff5068]",
  "before:absolute before:top-0 before:left-0 before:-z-1 before:block before:size-full before:bg-transparent",
  "hover:before:hover-glow focus:before:hover-glow",
].join(" ");

export default function HomeContent() {
  const t = useT();
  return (
    <main className="flex flex-1 flex-col items-center">
      <Link className="h-auto max-h-[5.2rem] w-full max-w-[51rem] flex-[0_0_0%]" href="/">
        <img className="h-auto w-full" src="/images/blacksmith.png" alt={t.site.logoAlt} />
      </Link>

      <BorderRule />

      <div className="flex h-full w-full">
        <div className="mx-auto flex h-full w-full max-w-[66vw] flex-1 flex-col justify-center gap-[1.3rem] self-start">
          <ul className="m-0 list-none p-0">
            {MENU.map(({ href, label, section }) => (
              <li key={href} className={menuItem}>
                {section ? (
                  <MenuLink section={section} className="block" />
                ) : (
                  <Link className="block" href={href}>
                    {t.common.sections[label]}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </main>
  );
}
