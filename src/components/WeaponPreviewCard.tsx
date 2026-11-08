import Card from "@/components/Card";
import Icon from "@/components/Icon";
import SharpnessBar from "@/components/SharpnessBar";
import type { Weapon } from "@/lib/types";

/** The game's shortened element labels ("Thndr Attrib"). */
const ELEMENT_LABELS: Record<string, string> = { Thunder: "Thndr" };

/** Rarity tint for the name, like the in-game equipment box; white below rarity 4. */
const nameColor = (rarity?: number) =>
  rarity && rarity >= 4 ? `var(--color-rarity-${rarity})` : undefined;

/**
 * The in-game equipment preview box (icon, name, attack, sharpness, element),
 * laid out at 600×300 for the link-preview image. Positions are measured from
 * a game screenshot.
 */
export default function WeaponPreviewCard({ weapon }: { weapon: Weapon }) {
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

      <div className="mt-[29px] flex flex-col gap-[14px] [&>p]:whitespace-pre">
        {weapon.attack !== undefined && (
          <p>
            {/* The game right-aligns attack in a four-digit field. */}
            <span className="text-stat">Attack:</span> {String(weapon.attack).padStart(4)}
          </p>
        )}

        {weapon.sharpness && (
          <div className="flex h-[26px] items-center">
            <span className="text-stat">Sharpness:</span>
            {/* The site's bar is drawn at 2×; the game's is 2.5× here. */}
            <div className="absolute left-[269px]">
              {/* Black behind the empty end of the bar, as in the game. */}
              <div className="relative [zoom:1.25] before:absolute before:inset-x-2 before:inset-y-[6px] before:bg-black">
                <SharpnessBar values={weapon.sharpness} />
              </div>
            </div>
          </div>
        )}

        {weapon.elements?.map((el) => (
          <p key={el.name}>
            {ELEMENT_LABELS[el.name] ?? el.name} Attrib: {el.attack}
          </p>
        ))}
      </div>
    </Card>
  );
}
