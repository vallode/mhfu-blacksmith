"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Fuse from "fuse.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Card from "@/components/Card";
import { cn } from "@/lib/cn";
import { iconImgClass, iconStyle } from "@/lib/icon-style";

interface SearchEntry {
  name: string;
  slug: string;
  url: string;
  category: "weapon" | "armor" | "decoration" | "monster" | "quest";
  type: string;
  rank: string | null;
  rarity: number;
  elements: string;
  skills: string;
}

// A result row with a highlight strip (::before) that fills the row; it glows on hover/focus and for the keyboard-selected row.
const resultRow = [
  "relative flex h-[38px] items-center gap-[1rem] px-[1.6rem] text-white no-underline",
  "before:absolute before:top-0 before:left-0 before:-z-1 before:block before:h-full before:w-full before:bg-transparent",
  "hover:before:hover-glow focus:before:hover-glow",
].join(" ");

function iconStyleFor(item: SearchEntry) {
  switch (item.category) {
    case "weapon":
      return iconStyle({
        type: item.type,
        size: "mini",
        rarity: item.rarity,
        element: item.elements ? item.elements.toLowerCase().replace(/ /g, "") : null,
      });
    case "armor":
      return iconStyle({ type: item.type, rarity: item.rarity });
    case "decoration":
      return iconStyle({ type: "decoration", rarity: item.rarity });
    case "quest":
      return iconStyle({ type: "ticket" });
    default:
      return iconStyle({ type: item.type, monster: true });
  }
}

function iconSrcFor(item: SearchEntry): string {
  switch (item.category) {
    case "weapon":
      return `/images/${item.type}-mini.png`;
    case "armor":
      return `/images/${item.type}-mini.png`;
    case "decoration":
      return `/images/decoration-mini.png`;
    case "monster":
      return `/images/monsters/${item.slug}.png`;
    case "quest":
      return "/images/ticket.png";
    default:
      return "/images/unknown.png";
  }
}

export default function GlobalSearch() {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ item: SearchEntry; score?: number }[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const fuseRef = useRef<Fuse<SearchEntry> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const loadIndex = useCallback(async () => {
    if (fuseRef.current) return;
    try {
      const res = await fetch("/search-data.json");
      const data: SearchEntry[] = await res.json();
      fuseRef.current = new Fuse(data, {
        keys: [
          { name: "name", weight: 1.0 },
          { name: "skills", weight: 0.5 },
          { name: "elements", weight: 0.3 },
          { name: "type", weight: 0.3 },
        ],
        threshold: 0.35,
        minMatchCharLength: 2,
        includeScore: true,
      });
    } catch (e) {
      console.warn("Failed to load search index", e);
    }
  }, []);

  const open = useCallback(async () => {
    await loadIndex();
    setIsOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, [loadIndex]);

  const close = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setResults([]);
    setSelectedIndex(-1);
  }, []);

  useEffect(() => {
    const handleKeydown = (e: KeyboardEvent) => {
      const tag = (document.activeElement as HTMLElement)?.tagName;

      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        if (isOpen) close();
        else open();
        return;
      }

      if (!isOpen && e.key === "/" && !["INPUT", "TEXTAREA"].includes(tag)) {
        e.preventDefault();
        open();
        return;
      }

      if (isOpen && e.key === "Escape") close();
    };

    const handleClick = (e: MouseEvent) => {
      if ((e.target as Element).closest(".search-trigger")) open();
    };

    document.addEventListener("keydown", handleKeydown);
    document.addEventListener("click", handleClick);
    return () => {
      document.removeEventListener("keydown", handleKeydown);
      document.removeEventListener("click", handleClick);
    };
  }, [isOpen, open, close]);

  const handleInputKeydown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => (((i + 1) % results.length) + results.length) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => (((i - 1) % results.length) + results.length) % results.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = results[selectedIndex];
      if (hit) {
        close();
        router.push(hit.item.url);
      }
    }
  };

  const handleQueryChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const q = e.target.value;
    setQuery(q);
    setSelectedIndex(-1);

    if (!fuseRef.current || q.trim().length < 2) {
      setResults([]);
      return;
    }

    setResults(fuseRef.current.search(q.trim(), { limit: 10 }));
  };

  return (
    <div
      className={cn(
        "fixed inset-0 z-1000 hidden h-full",
        isOpen && "flex items-start justify-center pt-[8vh] mobile:items-stretch mobile:pt-0",
      )}
      role="dialog"
      aria-modal="true"
      aria-label="Search"
      aria-hidden={isOpen ? undefined : "true"}
    >
      <div className="absolute inset-0 bg-black/70" onClick={close} />

      <div className="relative z-1 mx-[1.4rem] flex max-h-[80%] min-h-0 min-w-0 flex-[0_1_62rem] mobile:mx-4 mobile:max-h-none mobile:flex-auto">
        <Card className="min-h-0 min-w-0 gap-0 px-[1.6rem] py-[1.6rem] text-sub">
          {/* The frame's top band ends 11px into the card. This margin and the
              divider's leave 11px above and below the 22px row. */}
          <div className="mt-[0.6rem] flex shrink-0 items-center gap-[1rem]">
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
              className="shrink-0 opacity-60"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={inputRef}
              className="min-w-0 flex-1 border-none bg-transparent px-[1.6rem] py-0 font-[inherit] text-main leading-none text-white outline-none placeholder:text-white/35 [&::-webkit-search-cancel-button]:hidden"
              type="search"
              placeholder="Search weapons, armor, monsters…"
              value={query}
              onChange={handleQueryChange}
              onKeyDown={handleInputKeydown}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <hr className="mt-[1.1rem] mb-[1rem]" />

          <div className="min-h-0 flex-1 overflow-y-auto" role="listbox">
            {results.length === 0 && query.trim().length >= 2 && (
              <p className="px-[1.6rem] py-[2rem] text-center text-sub text-white/40">
                No results found
              </p>
            )}

            {results.map((result, index) => {
              const item = result.item;
              const selected = index === selectedIndex;
              return (
                <Link
                  key={`${item.category}-${item.slug}-${index}`}
                  href={item.url}
                  className={cn(resultRow, selected && "before:hover-glow")}
                  role="option"
                  aria-selected={selected}
                  onClick={close}
                >
                  <div {...iconStyleFor(item)}>
                    <img
                      className={iconImgClass({
                        size: item.category === "weapon" ? "mini" : undefined,
                        monster: item.category === "monster",
                      })}
                      src={iconSrcFor(item)}
                      alt=""
                      onError={(e) => {
                        (e.currentTarget.parentElement as HTMLElement).style.opacity = "0";
                      }}
                    />
                  </div>
                  <p className="m-0 min-w-0 flex-1 truncate">{item.name}</p>
                  {item.rank && (
                    <span className="shrink-0 text-fine text-white/50 capitalize">{item.rank}</span>
                  )}
                </Link>
              );
            })}
          </div>
        </Card>
      </div>
    </div>
  );
}
