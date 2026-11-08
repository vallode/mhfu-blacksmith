import Link from "next/link";
import { ARMOR_SLOTS, type ArmorRank, type ArmorSlot } from "@/lib/constants";
import Icon from "./Icon";

interface ArmorNavProps {
  activeSlot?: ArmorSlot;
  /** Rank the slot links open at; defaults to low rank. */
  rank?: ArmorRank;
}

function formatSlotName(slot: string): string {
  return slot.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function ArmorNav({ activeSlot, rank = "low-rank" }: ArmorNavProps) {
  return (
    <nav className="flex w-full items-center justify-start mobile:flex-wrap mobile:justify-center">
      <div>
        <Link href="/armorsmith/" aria-label="Back">
          <Icon type="arrow" nav alt="Back" />
        </Link>
      </div>

      {ARMOR_SLOTS.map((slot) => {
        const name = formatSlotName(slot);
        return (
          <div key={slot}>
            <Link href={`/armorsmith/${slot}/${rank}/`} title={name}>
              <Icon type={slot} size="large" nav active={activeSlot === slot} alt={name} />
            </Link>
          </div>
        );
      })}

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
