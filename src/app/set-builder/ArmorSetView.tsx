"use client";

/**
 * One search result, laid out like the game's equipment set screen: the
 * "◀ Set 1  1/20 ▶" selector bar, a row per piece ("icon : name", weapon
 * first) with its decorations under it, then [Activate Skill]. The Status
 * panel (defence and resistances) is SetStatus, shown beside it.
 */
import Link from "next/link";
import Icon from "@/components/Icon";
import SelectorArrow from "@/components/SelectorArrow";
import { Slots } from "@/components/DetailPanel";
import { cn } from "@/lib/cn";
import type { ArmorSet, DecoBin, PlacedDeco } from "@/lib/set-search";

/** Spaced-out lettering of the game's menus. */
export const gameText = "tracking-[0.12em]";

const RES_LABELS = ["Fire Res", "Water Res", "Thundr Res", "Ice Res", "Dragon Res"];

function Decorations({ decos }: { decos: PlacedDeco[] }) {
  if (decos.length === 0) return null;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-[1.6rem] gap-y-[0.2rem] p-0 text-[1.4rem]">
      {decos.map((d, i) => (
        <li key={i} className="flex items-center">
          <Icon type="decoration" size="mini" color={d.deco.color} className="scale-75" />
          <Link href={d.deco.href} className="text-white/80 hover:text-white">
            {d.deco.name}
          </Link>
        </li>
      ))}
    </ul>
  );
}

function EquipRow({
  icon,
  name,
  slots,
  decos,
  alternatives,
}: {
  icon: React.ReactNode;
  name: React.ReactNode;
  slots: number;
  decos: PlacedDeco[];
  alternatives?: React.ReactNode;
}) {
  return (
    <li className="grid grid-cols-[3.8rem_1.6rem_minmax(0,1fr)_auto] items-center gap-y-[0.2rem] py-[0.4rem]">
      {icon}
      <span className="text-stat">:</span>
      <span className={cn("truncate text-[1.9rem] text-white mobile:text-[1.6rem]", gameText)}>
        {name}
        {alternatives}
      </span>
      <span className="pl-[0.8rem] text-[1.4rem]">
        <Slots count={slots} />
      </span>
      <div className="col-start-3 col-end-5 empty:hidden">
        <Decorations decos={decos} />
      </div>
    </li>
  );
}

export function SetHeader({
  index,
  count,
  onStep,
}: {
  index: number;
  count: number;
  onStep: (by: 1 | -1) => void;
}) {
  return (
    <div
      role="group"
      aria-label="Sets"
      className="flex items-center gap-[1rem] bg-selector px-[0.4rem] py-[0.4rem]"
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        onStep(e.key === "ArrowLeft" ? -1 : 1);
      }}
    >
      <SelectorArrow className="size-[3.4rem]" label="Previous set" onClick={() => onStep(-1)} />
      <span
        className={cn(
          "flex-1 text-[2.2rem] text-stat text-shadow-[0.15rem_0.15rem_black] mobile:text-[1.8rem]",
          gameText,
        )}
        aria-live="polite"
      >
        Set {index + 1}
      </span>
      <span
        className={cn(
          "text-[2.2rem] text-white text-shadow-[0.15rem_0.15rem_black] mobile:text-[1.8rem]",
          gameText,
        )}
      >
        {index + 1}/{count}
      </span>
      <SelectorArrow next className="size-[3.4rem]" label="Next set" onClick={() => onStep(1)} />
    </div>
  );
}

export default function ArmorSetView({
  set,
  weaponSlots,
  weaponIcon,
  status,
}: {
  set: ArmorSet;
  weaponSlots: number;
  weaponIcon: string;
  /** The Status panel, beside [Activate Skill]. */
  status: React.ReactNode;
}) {
  const decosIn = (bin: DecoBin) => set.decorations.filter((d) => d.bin === bin);
  const alternatives = set.alternatives.flat().length;

  return (
    <div className="flex flex-col gap-[1.3rem]">
      <ul className="m-0 list-none px-[0.8rem] py-0">
        <EquipRow
          icon={<Icon type={weaponIcon} size="mini" alt="" />}
          name={<span className="text-white/60">Weapon</span>}
          slots={weaponSlots}
          decos={decosIn("weapon")}
        />
        {set.pieces.map((p, i) => (
          <EquipRow
            key={p.slot}
            icon={<Icon type={p.slot} size="mini" rarity={p.rarity} alt={p.slot} />}
            name={
              <Link href={p.href} className="hover:text-gold">
                {p.name}
              </Link>
            }
            slots={p.slots}
            decos={decosIn(p.slot)}
            alternatives={
              set.alternatives[i].length > 0 && (
                <span
                  className="ml-[0.8rem] text-[1.4rem] text-white/40"
                  title={set.alternatives[i].map((a) => a.name).join(", ")}
                >
                  +{set.alternatives[i].length}
                </span>
              )
            }
          />
        ))}
      </ul>

      <hr className="m-0 h-[3px]" />

      <div className="flex flex-wrap gap-x-[3.2rem] gap-y-[2rem] px-[0.8rem]">
        <div className="flex min-w-[24rem] flex-1 flex-col gap-[0.6rem]">
          <h3 className={cn("m-0 text-[1.9rem] font-normal text-stat", gameText)}>
            [Activate Skill]
          </h3>
          <ul className="m-0 list-none p-0">
            {set.skills.map((s) => (
              <li
                key={s.tree}
                className={cn(
                  "flex items-baseline gap-[1rem] text-[1.9rem] leading-[1.4] mobile:text-[1.6rem]",
                  gameText,
                  s.threshold < 0 ? "text-negative" : "text-white",
                )}
              >
                {s.name}
                <span className="text-[1.3rem] tracking-normal text-white/40">
                  {s.tree} {s.points > 0 ? `+${s.points}` : s.points}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-none flex-col gap-[0.6rem]">{status}</div>
      </div>

      {alternatives > 0 && (
        <details className="px-[0.8rem] text-[1.4rem] text-white/60">
          <summary className="cursor-pointer hover:text-white">
            {alternatives} other {alternatives === 1 ? "piece gives" : "pieces give"} the same
            points in your skills
          </summary>
          <ul className="m-0 mt-[0.6rem] list-none p-0">
            {set.alternatives.map((alts, i) =>
              alts.length === 0 ? null : (
                <li key={i} className="flex gap-[0.8rem] py-[0.2rem]">
                  <Icon type={set.pieces[i].slot} size="mini" className="scale-75" />
                  <span className="whitespace-normal">
                    {alts.map((a, j) => (
                      <span key={a.id}>
                        {j > 0 && ", "}
                        <Link href={a.href} className="hover:text-white">
                          {a.name}
                        </Link>
                      </span>
                    ))}
                  </span>
                </li>
              ),
            )}
          </ul>
          <p className="mt-[0.6rem] whitespace-normal">
            Their other skills differ, so a swap can add or remove a skill.
          </p>
        </details>
      )}
    </div>
  );
}

/** The game's Status panel for a set: defence and resistances. */
export function SetStatus({ set }: { set: ArmorSet | null }) {
  const rows: [string, React.ReactNode][] = [
    ["Defense", set?.defence ?? "-"],
    ...RES_LABELS.map((label, i): [string, React.ReactNode] => [label, set ? set.res[i] : "-"]),
    ["Free Slots", set?.freeSlots ?? "-"],
  ];
  return (
    <dl className="m-0 grid grid-cols-[max-content_2ch_5ch] gap-y-[0.4rem] text-[1.9rem] mobile:text-[1.6rem]">
      {rows.map(([label, value], i) => (
        <div
          key={label}
          className={cn(
            "contents",
            gameText,
            (i === 1 || i === rows.length - 1) && "[&>*]:mt-[1.2rem]",
          )}
        >
          <dt className="text-stat">{label}</dt>
          <dd className="m-0 text-stat">:</dd>
          <dd className="m-0 text-right text-white">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
