"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Fuse from "fuse.js";
import Link from "next/link";
import { useRouter } from "next/navigation";
import styles from "@/styles/search.module.scss";
import iconStyles from "./Icon.module.scss";

interface SearchEntry {
  name: string;
  slug: string;
  url: string;
  category: "weapon" | "armor" | "decoration" | "monster";
  type: string;
  rank: string | null;
  rarity: number;
  elements: string;
  skills: string;
}

function iconClassFor(item: SearchEntry): string {
  const rarity = item.rarity || 1;
  const i = (name: string) => iconStyles[`icon--${name}`] ?? "";
  switch (item.category) {
    case "weapon":
      return [
        iconStyles.icon,
        iconStyles["icon--mini"],
        i(item.type),
        i(`rarity-${rarity}`),
        item.elements ? i(item.elements.toLowerCase().replace(/ /g, "")) : "",
      ]
        .filter(Boolean)
        .join(" ");
    case "armor":
      return [iconStyles.icon, i(item.type), i(`rarity-${rarity}`)].filter(Boolean).join(" ");
    case "decoration":
      return [iconStyles.icon, i("decoration"), i(`rarity-${rarity}`)].filter(Boolean).join(" ");
    default:
      return [iconStyles.icon, iconStyles["icon--monster"], i(item.type)].filter(Boolean).join(" ");
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
        if (isOpen) close(); else open();
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
      setSelectedIndex((i) => ((i + 1) % results.length + results.length) % results.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => ((i - 1) % results.length + results.length) % results.length);
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
        className={`${styles["search-modal"]}${isOpen ? ` ${styles["is-open"]}` : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Search"
        aria-hidden={isOpen ? undefined : "true"}
      >
        <div className={styles["search-modal__backdrop"]} onClick={close} />

        <div className={styles["search-modal__panel"]}>
          <div className={styles["search-modal__header"]}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              ref={inputRef}
              className={styles["search-modal__input"]}
              type="search"
              placeholder="Search weapons, armor, monsters…"
              value={query}
              onChange={handleQueryChange}
              onKeyDown={handleInputKeydown}
              autoComplete="off"
              spellCheck={false}
            />
            <button className={styles["search-modal__close"]} onClick={close}>
              esc
            </button>
          </div>

          <hr />

          <div className={styles["search-modal__results"]} role="listbox">
            {results.length === 0 && query.trim().length >= 2 && (
              <p className={styles["search-results__empty"]}>No results found</p>
            )}

            {results.map((result, index) => {
              const item = result.item;
              const selected = index === selectedIndex;
              return (
                <Link
                  key={`${item.category}-${item.slug}-${index}`}
                  href={item.url}
                  className={`${styles["search-result"]}${selected ? ` ${styles["search-result--selected"]}` : ""}`}
                  role="option"
                  aria-selected={selected}
                  onClick={close}
                >
                  <div className={iconClassFor(item)}>
                    <img
                      src={iconSrcFor(item)}
                      alt=""
                      onError={(e) => {
                        (e.currentTarget.parentElement as HTMLElement).style.opacity = "0";
                      }}
                    />
                  </div>
                  <div className={styles["search-result__text"]}>
                    <p className={styles["search-result__name"]}>{item.name}</p>
                    {item.rank && (
                      <p className={styles["search-result__meta"]}>{item.rank}</p>
                    )}
                  </div>
                </Link>
              );
            })}
          </div>

          <div className={styles["search-modal__footer"]}>
            <span>↑↓ navigate</span>
            <span>↵ open</span>
            <span>esc close</span>
          </div>
        </div>
      </div>
  );
}
