import Link from "next/link";
import { WEAPON_TYPES } from "@/lib/constants";
import Card from "@/components/Card";
import Icon from "@/components/Icon";

function formatWeaponName(type: string): string {
  return type.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function BlacksmithListContent() {
  return (
    <>
      <nav className="flex w-full items-center justify-start mobile:flex-wrap mobile:justify-center">
        <div>
          <Link href="/" aria-label="Back">
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

      <hr className="border" />

      <div className="flex h-full w-full flex-wrap justify-center gap-[1.3rem] overflow-auto">
        <Card className="overflow-auto py-7">
          {WEAPON_TYPES.map((type) => {
            const name = formatWeaponName(type);
            return (
              <Link key={type} href={`/blacksmith/${type}/`} className="list-row">
                <Icon type={type} alt={name} />
                <p>{name}</p>
              </Link>
            );
          })}
        </Card>
      </div>
    </>
  );
}
