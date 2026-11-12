"use client";

/**
 * Set builder design prototypes, mobile-first, on the real search: three
 * layouts over one shared form and result, switched with the bar at the top
 * (and the URL hash, so a link opens one). Not linked from the site.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import BorderRule from "@/components/BorderRule";
import Icon from "@/components/Icon";
import { cn } from "@/lib/cn";
import ComparePrototype from "./ComparePrototype";
import LoadoutPrototype from "./LoadoutPrototype";
import StepsPrototype from "./StepsPrototype";
import { useProtoSearch } from "./useProtoSearch";

const VARIANTS = [
  { id: "loadout", label: "A Loadout", note: "One set, big rows, sheets" },
  { id: "compare", label: "B Compare", note: "Every set in a list" },
  { id: "steps", label: "C Steps", note: "Skills, hunter, sets" },
] as const;
type Variant = (typeof VARIANTS)[number]["id"];

export default function PrototypesClient() {
  const s = useProtoSearch();
  const [variant, setVariant] = useState<Variant>("loadout");

  useEffect(() => {
    const read = () => {
      const h = window.location.hash.slice(1);
      if (VARIANTS.some((v) => v.id === h)) setVariant(h as Variant);
    };
    read();
    window.addEventListener("hashchange", read);
    return () => window.removeEventListener("hashchange", read);
  }, []);

  const choose = (v: Variant) => {
    setVariant(v);
    window.history.replaceState(window.history.state, "", `#${v}`);
  };

  return (
    <>
      <nav className="flex w-full items-center gap-[1.2rem]">
        <Link href="/set-builder/" aria-label="Back to the set builder">
          <Icon type="arrow" nav alt="Back" />
        </Link>
        <span className="text-small text-parchment">Set builder prototypes</span>
      </nav>
      <BorderRule />
      <div className="mx-auto flex w-full max-w-[64rem] flex-col gap-[1.3rem] pb-[1.6rem]">
        <div role="tablist" aria-label="Prototype" className="flex gap-[0.4rem]">
          {VARIANTS.map((v) => (
            <button
              key={v.id}
              type="button"
              role="tab"
              aria-selected={v.id === variant}
              className={cn(
                "flex min-w-0 flex-1 cursor-pointer flex-col items-center gap-[0.2rem] border-2 px-[0.4rem] py-[0.6rem] font-[inherit] leading-tight shadow-[0.2rem_0.2rem_0_black]",
                v.id === variant
                  ? "border-stat bg-black/60 text-stat"
                  : "border-white/20 bg-black/40 text-white/70 hover:border-white/50",
              )}
              onClick={() => choose(v.id)}
            >
              <span className="text-small">{v.label}</span>
              <span className="max-w-full truncate text-fine text-white/50">{v.note}</span>
            </button>
          ))}
        </div>
        {variant === "loadout" && <LoadoutPrototype s={s} />}
        {variant === "compare" && <ComparePrototype s={s} />}
        {variant === "steps" && <StepsPrototype s={s} />}
      </div>
    </>
  );
}
