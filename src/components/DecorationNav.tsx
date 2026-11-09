"use client";

import Link from "next/link";
import Icon from "./Icon";
import { useT } from "@/context/LanguageContext";

/** Top bar for the decorations: back arrow and search. */
export default function DecorationNav() {
  const t = useT();
  return (
    <nav className="flex w-full items-center justify-start mobile:flex-wrap mobile:justify-center">
      <div>
        <Link href="/" aria-label={t.common.back}>
          <Icon type="arrow" nav alt={t.common.back} />
        </Link>
      </div>
      <div className="ml-auto">
        <button
          className="search-trigger flex h-[52px] w-[52px] cursor-pointer items-center border-none bg-transparent p-0 text-white/60 hover:text-white [&>img]:h-full"
          aria-label={t.equipment.nav.search}
        >
          <img src="/images/binoculars.png" alt={t.equipment.nav.search} decoding="sync" />
        </button>
      </div>
    </nav>
  );
}
