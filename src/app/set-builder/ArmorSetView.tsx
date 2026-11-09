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
import { useGameText, useLocale, useT } from "@/context/LanguageContext";
import { cn } from "@/lib/cn";
import { ARMOR_SLOTS } from "@/lib/constants";
import type { Messages } from "@/lib/i18n/messages";
import { MAX_WEAPON_SLOTS, type SetProblem, type SetWarning } from "@/lib/set-build";
import type { ArmorSet, DecoBin, Piece, PlacedDeco } from "@/lib/set-search";

/** A slot's name in the site's language: "Head", "Weapon". */
export function binLabel(t: Messages, bin: DecoBin): string {
  return bin === "weapon" ? t.setBuilder.setView.weapon : t.common.armorSlots[bin];
}

/** "+7", "-3", "0" */
const signed = (n: number) => (n > 0 ? `+${n}` : String(n));

/** A validateBuild problem in the site's language. */
export function useProblemText(): (p: SetProblem) => string {
  const t = useT();
  const game = useGameText();
  const w = t.setBuilder.warnings;
  const piece = (name: string) => game.name("armor", name);
  return (p) => {
    switch (p.kind) {
      case "weapon-slots":
        return w.weaponSlots(p.max, p.slots);
      case "wrong-slot":
        return w.wrongSlot(piece(p.piece), binLabel(t, p.is), binLabel(t, p.slot));
      case "hunter-type":
        return w.hunterType(piece(p.piece), t.setBuilder.hunterTypes[p.hunterType]);
      case "sex":
        return w.sex(piece(p.piece), p.sex);
      case "torso-up":
        return w.torsoUp(piece(p.piece));
      case "empty-slot":
        return w.emptySlot(binLabel(t, p.bin));
      case "too-many-decorations":
        return w.tooManyDecorations(p.piece === null ? null : piece(p.piece), p.used, p.has);
    }
  };
}

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

const smallButton =
  "cursor-pointer border-none bg-transparent p-0 font-[inherit] text-fine text-white/50 hover:text-white focus-visible:text-white";

function Decorations({
  decos,
  edit,
}: {
  decos: { placed: PlacedDeco; index: number }[];
  edit?: SetEditing;
}) {
  const t = useT();
  const game = useGameText();
  if (decos.length === 0) return null;
  return (
    <ul className="m-0 flex list-none flex-wrap gap-x-[1.6rem] gap-y-[0.2rem] p-0 text-fine">
      {decos.map(({ placed: d, index }) => (
        <li key={index} className="flex items-center">
          <Icon type="decoration" size="mini" color={d.deco.color} className="scale-75" />
          <Link href={d.deco.href} className="text-white/80 hover:text-white">
            {game.name("decoration", d.deco.name)}
          </Link>
          {edit && (
            <button
              type="button"
              className={cn(smallButton, "px-[0.6rem] text-small leading-none hover:text-negative")}
              aria-label={t.setBuilder.setView.remove(game.name("decoration", d.deco.name))}
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
  edit,
  warnings,
}: {
  bin: DecoBin;
  icon: React.ReactNode;
  name: React.ReactNode;
  slots: React.ReactNode;
  decos: { placed: PlacedDeco; index: number }[];
  alternatives?: React.ReactNode;
  edit?: SetEditing;
  warnings?: SetWarning[];
}) {
  const t = useT();
  const problemText = useProblemText();
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
            aria-label={t.setBuilder.setView.addJewelLabel(binLabel(t, bin))}
            onClick={() => edit.onAddDecoration(bin)}
          >
            {t.setBuilder.setView.addJewel}
          </button>
        )}
      </div>
      {warnings?.map((w, i) => (
        <p
          key={i}
          role="alert"
          className="col-start-3 col-end-5 m-0 text-fine whitespace-normal text-negative"
        >
          {problemText(w.problem)}
        </p>
      ))}
    </li>
  );
}

/** The weapon row's slot count: "◀ OO- ▶" when editing. */
function WeaponSlots({ count, edit }: { count: number; edit?: SetEditing }) {
  const text = useT().setBuilder.setView;
  if (!edit) return <Slots count={count} />;
  const step = (by: 1 | -1) =>
    edit.onWeaponSlots((count + by + MAX_WEAPON_SLOTS + 1) % (MAX_WEAPON_SLOTS + 1));
  return (
    <span
      role="group"
      aria-label={text.weaponSlots}
      className="flex items-center gap-[0.4rem]"
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        step(e.key === "ArrowLeft" ? -1 : 1);
      }}
    >
      <SelectorArrow
        className="size-[2.4rem]"
        label={text.fewerWeaponSlots}
        onClick={() => step(-1)}
      />
      <span aria-live="polite" aria-label={text.weaponSlotCount(count)}>
        <Slots count={count} />
      </span>
      <SelectorArrow
        next
        className="size-[2.4rem]"
        label={text.moreWeaponSlots}
        onClick={() => step(1)}
      />
    </span>
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
  const text = useT().setBuilder.setView;
  return (
    <div
      role="group"
      aria-label={text.sets}
      className="flex items-center gap-[1rem] bg-selector px-[0.4rem] py-[0.4rem]"
      onKeyDown={(e) => {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        onStep(e.key === "ArrowLeft" ? -1 : 1);
      }}
    >
      <SelectorArrow
        className="size-[3.4rem]"
        label={text.previousSet}
        onClick={() => onStep(-1)}
      />
      <span
        className={cn("flex-1 text-main text-stat text-shadow-[0.15rem_0.15rem_black]")}
        aria-live="polite"
      >
        {text.setNumber(index + 1)}
      </span>
      <span className={cn("text-main text-white text-shadow-[0.15rem_0.15rem_black]")}>
        {index + 1}/{count}
      </span>
      <SelectorArrow
        next
        className="size-[3.4rem]"
        label={text.nextSet}
        onClick={() => onStep(1)}
      />
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
  const t = useT();
  const game = useGameText();
  const text = t.setBuilder.setView;
  const label = binLabel(t, slot);
  const name = piece ? game.name("armor", piece.name) : "";
  if (!edit) {
    return piece ? (
      <Link href={piece.href} className="hover:text-gold">
        {name}
      </Link>
    ) : (
      <span className="text-white/40">-</span>
    );
  }
  return (
    <button
      type="button"
      className="w-full cursor-pointer truncate border-none bg-transparent p-0 text-left font-[inherit] text-[inherit] text-white hover:text-gold focus-visible:text-gold mobile:whitespace-normal"
      aria-label={piece ? text.pieceLabel(label, name) : text.emptyLabel(label)}
      onClick={() => edit.onPickPiece(slot)}
    >
      {piece ? name : <span className="text-white/40">{text.choose}</span>}
      {piece && edit.isOwned?.(piece) && (
        <span className="ml-[0.8rem] text-fine text-positive">{text.owned}</span>
      )}
      {piece?.torsoUp && (
        <span className="ml-[0.8rem] text-fine text-white/50">{text.torsoUp}</span>
      )}
    </button>
  );
}

export default function ArmorSetView({
  set,
  weaponSlots,
  weaponIcon,
  status,
  edit,
}: {
  set: Pick<ArmorSet, "pieces" | "decorations" | "skills" | "totals"> &
    Partial<Pick<ArmorSet, "alternatives">>;
  weaponSlots: number;
  weaponIcon: string;
  /** The Status panel, beside [Activate Skill]. */
  status: React.ReactNode;
  edit?: SetEditing;
}) {
  const t = useT();
  const game = useGameText();
  const text = t.setBuilder.setView;
  const problemText = useProblemText();
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
          name={<span className="text-white/60">{text.weapon}</span>}
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
              icon={<Icon type={slot} size="mini" rarity={p?.rarity} alt={binLabel(t, slot)} />}
              name={<PieceName piece={p} slot={slot} edit={edit} />}
              slots={<Slots count={p?.slots ?? 0} />}
              decos={decosIn(slot)}
              edit={edit}
              warnings={warningsFor(slot)}
              alternatives={
                alts.length > 0 && (
                  <span
                    className="ml-[0.8rem] text-fine text-white/40"
                    title={alts.map((a) => game.name("armor", a.name)).join(", ")}
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
            {problemText(w.problem)}
          </p>
        ))}

      <hr className="m-0 h-[3px]" />

      <div className="flex flex-wrap gap-x-[3.2rem] gap-y-[2rem] px-[0.8rem]">
        <div className="flex min-w-[24rem] flex-1 flex-col gap-[0.6rem]">
          <h3 className={cn("m-0 text-sub font-normal text-stat")}>{text.activeSkills}</h3>
          {set.skills.length === 0 && (
            <p className="m-0 text-small text-white/40">{text.noSkills}</p>
          )}
          <ul className="m-0 list-none p-0">
            {set.skills.map((s) => (
              <li
                key={s.tree}
                className={cn(
                  "flex items-baseline gap-[1rem] text-sub leading-[1.4] mobile:text-small",
                  s.threshold < 0 ? "text-negative" : "text-white",
                )}
              >
                {game.name("skill", s.name)}
                <span className="text-fine text-white/40">
                  {game.name("skill", s.tree)} {signed(s.points)}
                </span>
              </li>
            ))}
          </ul>
          {edit && points.length > 0 && (
            <details className="text-fine text-white/60">
              <summary className="cursor-pointer hover:text-white">{text.allPoints}</summary>
              <ul className="m-0 mt-[0.6rem] list-none p-0">
                {points.map(([tree, v]) => (
                  <li key={tree} className="flex gap-[1rem]">
                    <span className="w-cells-14">{game.name("skill", tree)}</span>
                    <span className={v < 0 ? "text-negative" : "text-white"}>{signed(v)}</span>
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
            {text.alternatives(alternatives)}
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
                          {game.name("armor", a.name)}
                        </Link>
                      </span>
                    ))}
                  </span>
                </li>
              ),
            )}
          </ul>
          <p className="mt-[0.6rem] whitespace-normal">{text.alternativesNote}</p>
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
  const text = useT().setBuilder.status;
  const { formatNumber } = useLocale();
  const res = [text.fireRes, text.waterRes, text.thunderRes, text.iceRes, text.dragonRes];
  const rows: [string, React.ReactNode][] = [
    [text.defense, set ? formatNumber(set.defence) : "-"],
    ...res.map((label, i): [string, React.ReactNode] => [label, set ? set.res[i] : "-"]),
    [text.freeSlots, set?.freeSlots ?? "-"],
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
