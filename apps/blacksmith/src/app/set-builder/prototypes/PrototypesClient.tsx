"use client";

/**
 * Set builder design prototype, mobile-first, on the real search: the
 * "Loadout" layout (LoadoutPrototype). Not linked from the site.
 */
import Link from "next/link";
import BorderRule from "@/components/BorderRule";
import Icon from "@/components/Icon";
import LoadoutPrototype from "./LoadoutPrototype";
import { useProtoSearch } from "./useProtoSearch";

export default function PrototypesClient() {
  const s = useProtoSearch();
  return (
    <>
      <nav className="flex w-full items-center gap-[1.2rem]">
        <Link href="/set-builder/" aria-label="Back to the set builder">
          <Icon type="arrow" nav alt="Back" />
        </Link>
        <span className="text-small text-parchment">Set builder prototype</span>
      </nav>
      <BorderRule />
      <div className="mx-auto flex w-full max-w-[64rem] flex-col gap-[1.3rem] pb-[1.6rem]">
        <LoadoutPrototype s={s} />
      </div>
    </>
  );
}
