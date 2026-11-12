"use client";

/**
 * An armor set, laid out like the game's equipment set screen: the
 * "◀ Set 1  1/20 ▶" selector bar, a row per piece ("icon : name", weapon
 * first) with its decorations under it, then [Activate Skill]. The Status
 * panel (defence and resistances) is SetStatus, shown beside it.
 *
 * With `edit`, the same screen edits the set: a row opens the piece picker,
 * decorations come off with ×, "+ Jewel" adds one where slots are free, and
 * the weapon row sets the weapon's slots.
 */
import Link from "next/link";
import Icon from "@/components/Icon";
import SelectorArrow from "@/components/SelectorArrow";
import { Slots } from "@/components/DetailPanel";
import { cn } from "@/lib/cn";
import { ARMOR_SLOTS } from "@/lib/constants";
import { BIN_LABELS, MAX_WEAPON_SLOTS, type SetWarning } from "@/lib/set-build";
import type { ArmorSet, DecoBin, Piece, PlacedDeco } from "@/lib/set-search";

const RES_LABELS = ["Fire Res", "Water Res", "Thundr Res", "Ice Res", "Dragon Res"];

/** Editing callbacks; without them the view is read-only. */
export interface SetEditing {
  onPickPiece: (slot: (typeof ARMOR_SLOTS)[number]) => void;
  onAddDecoration: (bin: DecoBin) => void;
  /** `index` is into the set's `decorations`. */
  onRemoveDecoration: (index: number) => void;
  onWeaponSlots: (slots: number) => void;
  /** Free slots per bin, to offer "+ Jewel". */
  freeSlots: (bin: DecoBin) => number;
  warnings: SetWarning[];
  isOwned?: (piece: Piece) => boolean;
}

/** Search actions on a result's pieces: keep one in every set, or leave it out. */
export interface PieceActions {
  isLocked: (piece: Piece) => boolean;
  /** Lock the piece, or unlock it if it's locked. */
  onLock: (piece: Piece) => void;
  onExclude: (piece: Piece) => void;
}

const smallButton =
  "cursor-pointer border-none bg-transparent p-0 font-[inherit] text-fine text-white/50 hover:text-white focus-visible:text-white";

function Decorations({
  decos,
  edit,
}: {
  decos: { placed: PlacedDeco; index: number }[];
  edit?: SetEditing;
}) {
  if (decos.length === 0) return null;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-[1.6rem] gap-y-[0.2rem] p-0 text-fine">
      {decos.map(({ placed: d, index }) => (
        <li key={index} className="flex items-center">
          <Icon type="decoration" size="mini" color={d.deco.color} className="scale-75" />
          <Link href={d.deco.href} className="text-white/80 hover:text-white">
            {d.deco.name}
          </Link>
          {edit && (
            <button
              type="button"
              className={cn(smallButton, "px-[0.6rem] text-small leading-none hover:text-negative")}
              aria-label={`Remove ${d.deco.name}`}
              onClick={() => edit.onRemoveDecoration(index)}
            >
              ×
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}

function EquipRow({
  bin,
  icon,
  name,
  slots,
  decos,
  alternatives,
  actions,
  edit,
  warnings,
}: {
  bin: DecoBin;
  icon: React.ReactNode;
  name: React.ReactNode;
  slots: React.ReactNode;
  decos: { placed: PlacedDeco; index: number }[];
  alternatives?: React.ReactNode;
  actions?: React.ReactNode;
  edit?: SetEditing;
  warnings?: SetWarning[];
}) {
  const free = edit?.freeSlots(bin) ?? 0;
  return (
    <li className="grid grid-cols-[3.8rem_1.6rem_minmax(0,1fr)_auto] items-center gap-y-[0.2rem] py-[0.4rem]">
      {icon}
      <span className="text-stat">:</span>
      <span
        className={cn(
          "truncate text-sub text-white mobile:text-small mobile:wrap-break-word mobile:whitespace-normal",
        )}
      >
        {name}
        {alternatives}
      </span>
      <span className="pl-[0.8rem] text-fine">{slots}</span>
      <div className="col-start-3 col-end-5 flex flex-wrap items-center gap-x-[1.6rem] empty:hidden">
        <Decorations decos={decos} edit={edit} />
        {edit && free > 0 && (
          <button
            type="button"
            className={smallButton}
            aria-label={`Add a decoration to the ${BIN_LABELS[bin].toLowerCase()} slots`}
            onClick={() => edit.onAddDecoration(bin)}
          >
            + Jewel
          </button>
        )}
        {actions}
      </div>
      {warnings?.map((w, i) => (
        <p
          key={i}
          role="alert"
          className="col-start-3 col-end-5 m-0 text-fine whitespace-normal text-negative"
        >
          {w.message}
        </p>
      ))}
    </li>
  );
}

/** The weapon row's slot count: "◀ OO- ▶" when editing. */
function WeaponSlots({ count, edit }: { count: number; edit?: SetEditing }) {
  if (!edit) return <Slots count={count} />;
  const step = (by: 1 | -1) =>
    edit.onWeaponSlots((count + by + MAX_WEAPON_SLOTS + 1) % (MAX_WEAPON_SLOTS + 1));
  return (
    <span
      role="group"
      aria-label="Weapon slots"
      className="flex items-center gap-[0.4rem]"
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        step(e.key === "ArrowLeft" ? -1 : 1);
      }}
    >
      <SelectorArrow
        className="size-[2.4rem]"
        label="Fewer weapon slots"
        onClick={() => step(-1)}
      />
      <span aria-live="polite" aria-label={`${count} weapon slots`}>
        <Slots count={count} />
      </span>
      <SelectorArrow
        next
        className="size-[2.4rem]"
        label="More weapon slots"
        onClick={() => step(1)}
      />
    </span>
  );
}

/** "Lock" and "Exclude" under a result's piece. */
function PieceButtons({ piece, actions }: { piece: Piece; actions: PieceActions }) {
  const locked = actions.isLocked(piece);
  return (
    <span className="ml-auto flex gap-[1.2rem]">
      <button
        type="button"
        className={cn(smallButton, locked && "text-stat")}
        aria-pressed={locked}
        aria-label={`Lock ${piece.name}: use it in every set`}
        onClick={() => actions.onLock(piece)}
      >
        {locked ? "Locked" : "Lock"}
      </button>
      {!locked && (
        <button
          type="button"
          className={cn(smallButton, "hover:text-negative focus-visible:text-negative")}
          aria-label={`Exclude ${piece.name}: never use it`}
          onClick={() => actions.onExclude(piece)}
        >
          Exclude
        </button>
      )}
    </span>
  );
}

export function SetHeader({
  index,
  count,
  onStep,
  action,
}: {
  index: number;
  count: number;
  onStep: (by: 1 | -1) => void;
  /** A button shown beside the set number. */
  action?: React.ReactNode;
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
        className={cn("flex-1 text-main text-stat text-shadow-[0.15rem_0.15rem_black]")}
        aria-live="polite"
      >
        Set {index + 1}
      </span>
      {action}
      <span className={cn("text-main text-white text-shadow-[0.15rem_0.15rem_black]")}>
        {index + 1}/{count}
      </span>
      <SelectorArrow next className="size-[3.4rem]" label="Next set" onClick={() => onStep(1)} />
    </div>
  );
}

function PieceName({
  piece,
  slot,
  edit,
}: {
  piece?: Piece;
  slot: (typeof ARMOR_SLOTS)[number];
  edit?: SetEditing;
}) {
  const label = BIN_LABELS[slot];
  if (!edit) {
    return piece ? (
      <Link href={piece.href} className="hover:text-gold">
        {piece.name}
      </Link>
    ) : (
      <span className="text-white/40">-</span>
    );
  }
  return (
    <button
      type="button"
      className="w-full cursor-pointer truncate border-none bg-transparent p-0 text-left font-[inherit] text-[inherit] text-white hover:text-gold focus-visible:text-gold mobile:whitespace-normal"
      aria-label={piece ? `${label}: ${piece.name}. Change` : `${label}: empty. Choose a piece`}
      onClick={() => edit.onPickPiece(slot)}
    >
      {piece ? piece.name : <span className="text-white/40">- Choose -</span>}
      {piece && edit.isOwned?.(piece) && (
        <span className="ml-[0.8rem] text-fine text-positive">Owned</span>
      )}
      {piece?.torsoUp && <span className="ml-[0.8rem] text-fine text-white/50">Torso Up</span>}
    </button>
  );
}

export default function ArmorSetView({
  set,
  weaponSlots,
  weaponIcon,
  status,
  edit,
  pieceActions,
}: {
  set: Pick<ArmorSet, "pieces" | "decorations" | "skills" | "totals"> &
    Partial<Pick<ArmorSet, "alternatives">>;
  weaponSlots: number;
  weaponIcon: string;
  /** The Status panel, beside [Activate Skill]. */
  status: React.ReactNode;
  edit?: SetEditing;
  pieceActions?: PieceActions;
}) {
  const decosIn = (bin: DecoBin) =>
    set.decorations
      .map((placed, index) => ({ placed, index }))
      .filter(({ placed }) => placed.bin === bin);
  const warningsFor = (bin: DecoBin) => edit?.warnings.filter((w) => w.bin === bin);
  const alternatives = set.alternatives?.flat().length ?? 0;
  const points = Object.entries(set.totals)
    .filter(([, v]) => v !== 0)
    .sort((a, b) => b[1] - a[1]);

  return (
    <div className="flex flex-col gap-[1.3rem]">
      <ul className="m-0 list-none px-[0.8rem] py-0">
        <EquipRow
          bin="weapon"
          icon={<Icon type={weaponIcon} size="mini" alt="" />}
          name={<span className="text-white/60">Weapon</span>}
          slots={<WeaponSlots count={weaponSlots} edit={edit} />}
          decos={decosIn("weapon")}
          edit={edit}
          warnings={warningsFor("weapon")}
        />
        {ARMOR_SLOTS.map((slot) => {
          const p = set.pieces.find((x) => x.slot === slot);
          if (!p && !edit) return null;
          const alts = set.alternatives?.[set.pieces.indexOf(p!)] ?? [];
          return (
            <EquipRow
              key={slot}
              bin={slot}
              icon={<Icon type={slot} size="mini" rarity={p?.rarity} alt={slot} />}
              name={<PieceName piece={p} slot={slot} edit={edit} />}
              slots={<Slots count={p?.slots ?? 0} />}
              decos={decosIn(slot)}
              edit={edit}
              warnings={warningsFor(slot)}
              actions={p && pieceActions && <PieceButtons piece={p} actions={pieceActions} />}
              alternatives={
                alts.length > 0 && (
                  <span
                    className="ml-[0.8rem] text-fine text-white/40"
                    title={alts.map((a) => a.name).join(", ")}
                  >
                    +{alts.length}
                  </span>
                )
              }
            />
          );
        })}
      </ul>

      {edit?.warnings
        .filter((w) => !w.bin)
        .map((w, i) => (
          <p key={i} role="alert" className="m-0 px-[0.8rem] text-fine text-negative">
            {w.message}
          </p>
        ))}

      <hr className="m-0 h-[3px]" />

      <div className="flex flex-wrap gap-x-[3.2rem] gap-y-[2rem] px-[0.8rem]">
        <div className="flex min-w-[24rem] flex-1 flex-col gap-[0.6rem]">
          <h3 className={cn("m-0 text-sub font-normal text-stat")}>[Activate Skill]</h3>
          {set.skills.length === 0 && <p className="m-0 text-small text-white/40">None</p>}
          <ul className="m-0 list-none p-0">
            {set.skills.map((s) => (
              <li
                key={s.tree}
                className={cn(
                  "flex items-baseline gap-[1rem] text-sub leading-[1.4] mobile:text-small",
                  s.threshold < 0 ? "text-negative" : "text-white",
                )}
              >
                {s.name}
                <span className="text-fine text-white/40">
                  {s.tree} {s.points > 0 ? `+${s.points}` : s.points}
                </span>
              </li>
            ))}
          </ul>
          {edit && points.length > 0 && (
            <details className="text-fine text-white/60">
              <summary className="cursor-pointer hover:text-white">All skill points</summary>
              <ul className="m-0 mt-[0.6rem] list-none p-0">
                {points.map(([tree, v]) => (
                  <li key={tree} className="flex gap-[1rem]">
                    <span className="w-cells-14">{tree}</span>
                    <span className={v < 0 ? "text-negative" : "text-white"}>
                      {v > 0 ? `+${v}` : v}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
        <div className="flex flex-none flex-col gap-[0.6rem]">{status}</div>
      </div>

      {alternatives > 0 && set.alternatives && (
        <details className="px-[0.8rem] text-fine text-white/60">
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

/** A panel's title: yellow heading, as on the game's selector bar. */
export function PanelTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className={cn("m-0 text-main font-normal text-stat text-shadow-[0.15rem_0.15rem_black]")}>
      {children}
    </h2>
  );
}

/** The game's Status panel for a set: defence and resistances. */
export function SetStatus({
  set,
}: {
  set: Pick<ArmorSet, "defence" | "res" | "freeSlots"> | null;
}) {
  const rows: [string, React.ReactNode][] = [
    ["Defense", set?.defence ?? "-"],
    ...RES_LABELS.map((label, i): [string, React.ReactNode] => [label, set ? set.res[i] : "-"]),
    ["Free Slots", set?.freeSlots ?? "-"],
  ];
  return (
    <dl className="m-0 grid grid-cols-[max-content_calc(var(--cell)*2)_calc(var(--cell)*5)] gap-y-[0.4rem] text-sub mobile:text-small">
      {rows.map(([label, value], i) => (
        <div
          key={label}
          className={cn("contents", (i === 1 || i === rows.length - 1) && "[&>*]:mt-[1.2rem]")}
        >
          <dt className="text-stat">{label}</dt>
          <dd className="m-0 text-stat">:</dd>
          <dd className="m-0 text-right text-white">{value}</dd>
        </div>
      ))}
    </dl>
  );
}
