import Card from "@/components/Card";
import Icon from "@/components/Icon";
import SharpnessBar from "@/components/SharpnessBar";
import { cn } from "@/lib/cn";
import type { Weapon } from "@/lib/types";

/** The game's shortened element labels ("Thndr Attrib"). */
const ELEMENT_LABELS: Record<string, string> = {
  Thunder: "Thndr",
  Paralysis: "Para",
  Dragon: "Dragn",
  Poison: "Poisn",
};

/** Rarity tint for the name, like the in-game equipment box; white below rarity 4. */
const nameColor = (rarity?: number) =>
  rarity && rarity >= 4 ? `var(--color-rarity-${rarity})` : undefined;

/** "OO-": a circle per slot, dashes for the rest. */
const slots = (count = 0) => Array.from({ length: 3 }, (_, i) => (i < count ? "O" : "-")).join("");

/**
 * One line of the box. `right` sits in the second column, which starts where
 * the game draws the sharpness bar.
 */
function Row({ children, right }: { children?: React.ReactNode; right?: React.ReactNode }) {
  return (
    // Text goes in spans: loose text in a flex row drops the space after "Attack:".
    <div className="flex h-[26px] items-center whitespace-pre">
      <span>{children}</span>
      {right && (
        <div className="absolute left-[269px] flex items-center">
          <span>{right}</span>
        </div>
      )}
    </div>
  );
}

/** A sharpness bar at the game's 2.5× (the site draws it at 2×). */
function Bar({ values, plus }: { values: (string | number)[]; plus?: boolean }) {
  return (
    // Black behind the empty end of the bar, as in the game.
    <div className="relative [zoom:1.25] before:absolute before:inset-x-2 before:inset-y-[6px] before:bg-black">
      <SharpnessBar values={values} plus={plus} />
    </div>
  );
}

/**
 * The in-game equipment preview box, laid out at 600×300 for the link-preview
 * image. The first lines (attack, sharpness, element) sit where the game puts
 * them, measured from a screenshot; Sharpness+1, affinity and slots are extra
 * lines in the same style, and the spacing tightens when they don't fit.
 */
export default function WeaponPreviewCard({ weapon }: { weapon: Weapon }) {
  const rows = [
    weapon.attack !== undefined && (
      <Row key="attack">
        {/* The game right-aligns attack in a four-digit field. */}
        <span className="text-stat">Attack:</span> {String(weapon.attack).padStart(4)}
      </Row>
    ),
    weapon.sharpness && (
      <Row key="sharpness" right={<Bar values={weapon.sharpness} />}>
        <span className="text-stat">Sharpness:</span>
      </Row>
    ),
    weapon.sharpness_plus && (
      <Row key="sharpness-plus" right={<Bar values={weapon.sharpness_plus} plus />}>
        <span className="text-stat">Sharpness+1:</span>
      </Row>
    ),
    ...(weapon.elements ?? []).map((el) => (
      <Row key={el.name}>
        {ELEMENT_LABELS[el.name] ?? el.name} Attrib: {el.attack}
      </Row>
    )),
    <Row
      key="affinity-slots"
      right={
        <>
          <span className="text-stat">Slots:</span> {slots(weapon.slots)}
        </>
      }
    >
      <span className="text-stat">Affinity:</span> {weapon.affinity ?? "0%"}
    </Row>,
  ].filter(Boolean);

  return (
    <Card className="px-[24px] pt-[25px] pb-0 text-[2.6rem] leading-none text-white mobile:text-[2.6rem]">
      <div className="flex items-center whitespace-pre">
        <Icon
          type={weapon.type}
          size="large"
          rarity={weapon.rarity}
          color={weapon.color}
          // The game draws the icon 2.5× (65px); scale keeps the 52px layout box.
          className="mr-0 scale-125"
        />
        <span> : </span>
        <span style={{ color: nameColor(weapon.rarity) }}>{weapon.name}</span>
      </div>

      {/* Game spacing for up to four lines; five or six close up to stay inside the frame. */}
      <div
        className={cn(
          "flex flex-col",
          rows.length <= 4 && "mt-[29px] gap-[14px]",
          rows.length === 5 && "mt-[19px] gap-[10px]",
          rows.length >= 6 && "mt-[19px] gap-[4px]",
        )}
      >
        {rows}
      </div>
    </Card>
  );
}
