import Link from "next/link";
import BorderRule from "@/components/BorderRule";
import WeaponsMenuLink from "./WeaponsMenuLink";

const MENU = [
  { href: "/blacksmith/", label: "Weapons" },
  { href: "/armorsmith/", label: "Armor" },
  { href: "/decorations/", label: "Decorations" },
  { href: "/set-builder/", label: "Set Builder" },
  { href: "/monsters/", label: "Monsters" },
  { href: "/quests/", label: "Quests" },
  { href: "/hunter/", label: "Hunter Profile" },
  { href: "/options/", label: "Options" },
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
  return (
    <main className="flex flex-1 flex-col items-center">
      <Link className="h-auto max-h-[5.2rem] w-full max-w-[51rem] flex-[0_0_0%]" href="/">
        <img className="h-auto w-full" src="/images/blacksmith.png" alt="Blacksmith" />
      </Link>

      <BorderRule />

      <div className="flex h-full w-full">
        <div className="mx-auto flex h-full w-full max-w-[66vw] flex-1 flex-col justify-center gap-[1.3rem] self-start">
          <ul className="m-0 list-none p-0">
            {MENU.map(({ href, label }) => (
              <li key={href} className={menuItem}>
                {href === "/blacksmith/" ? (
                  <WeaponsMenuLink className="block" />
                ) : (
                  <Link className="block" href={href}>
                    {label}
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
