"use client";

import Link from "next/link";
import { useT } from "@/context/LanguageContext";
import Icon from "./Icon";

/** Top bar for the quest pages: a back arrow and the search button. */
export default function QuestNav({ back }: { back: string }) {
  const t = useT();
  return (
    <nav className="flex w-full items-center justify-start mobile:flex-wrap mobile:justify-center">
      <div>
        <Link href={back} aria-label={t.common.back}>
          <Icon type="arrow" nav alt={t.common.back} />
        </Link>
      </div>
      <div className="ml-auto">
        <button
          className="search-trigger flex h-[52px] w-[52px] cursor-pointer items-center border-none bg-transparent p-0 text-white/60 hover:text-white [&>img]:h-full"
          aria-label={t.quests.search}
        >
          <img src="/images/binoculars.png" alt={t.quests.search} decoding="sync" />
        </button>
      </div>
    </nav>
  );
}
