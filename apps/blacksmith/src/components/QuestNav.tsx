import Link from "next/link";
import Icon from "./Icon";

/** Top bar for the quest pages: a back arrow and the search button. */
export default function QuestNav({ back }: { back: string }) {
  return (
    <nav className="flex w-full items-center justify-start mobile:flex-wrap mobile:justify-center">
      <div>
        <Link href={back} aria-label="Back">
          <Icon type="arrow" nav alt="Back" />
        </Link>
      </div>
      <div className="ml-auto">
        <button
          className="search-trigger flex h-[52px] w-[52px] cursor-pointer items-center border-none bg-transparent p-0 text-white/60 hover:text-white [&>img]:h-full"
          aria-label="Search"
        >
          <img src="/images/binoculars.png" alt="Search" decoding="sync" />
        </button>
      </div>
    </nav>
  );
}
