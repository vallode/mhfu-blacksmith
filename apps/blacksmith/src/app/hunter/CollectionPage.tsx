"use client";

import { useMemo } from "react";
import Link from "next/link";
import {
  DetailBody,
  DetailCard,
  DetailHeader,
  DetailName,
  DetailRule,
} from "@/components/DetailPanel";
import Icon from "@/components/Icon";
import { useLocale } from "@/context/LanguageContext";
import { useSave } from "@/context/SaveContext";
import { useAwardText } from "@/lib/client-data";
import { cn } from "@/lib/cn";
import {
  armorCollectionAward,
  weaponCollectionAward,
  type CollectionAward,
  type CollectionAwardGroup,
} from "@/lib/collection";
import type { ArmorSlot, WeaponType } from "@/lib/constants";
import { useEquipmentIds } from "@/lib/equipment";
import { progressBar } from "@/styles/progress";
import { NoHunter } from "./HunterPages";

/** A collection page that has nothing to list: no save data, or the IDs loading. */
function CollectionNote({ children }: { children: React.ReactNode }) {
  const text = useLocale().t.site.hunter;
  return (
    <DetailCard>
      <DetailHeader>
        <DetailName>{text.pages.collection}</DetailName>
      </DetailHeader>
      <DetailBody>
        <div className="text-small text-white/70">{children}</div>
      </DetailBody>
    </DetailCard>
  );
}

/** The eligible pieces a type still has to offer, linked to their pages. */
function MissingPieces({ group }: { group: CollectionAwardGroup }) {
  const { t, game } = useLocale();
  const text = t.site.hunter.collection;
  if (group.missing === 0 || group.missingPieces.length === 0) return null;
  return (
    <details className="text-small">
      <summary className="cursor-pointer text-stat hover:text-white">
        {text.missing(group.missingPieces.length)}
      </summary>
      <ul className="m-0 mt-[0.4rem] flex list-none flex-col gap-[0.4rem] p-0">
        {group.missingPieces.map((piece) => (
          <li key={piece.key}>
            <Link
              href={piece.href}
              className="flex min-w-0 items-center gap-[0.6rem] text-white hover:text-stat"
            >
              <Icon type={group.category} rarity={piece.rarity} size="mini" />
              <span className="min-w-0 truncate">{game.name(group.kind, piece.name)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** One weapon class or armor slot: its count towards the award and what's left. */
function CollectionGroupRow({ group }: { group: CollectionAwardGroup }) {
  const { t, formatNumber } = useLocale();
  const text = t.site.hunter.collection;
  const label =
    group.kind === "weapon"
      ? t.common.weaponTypes[group.category as WeaponType]
      : t.common.armorSlots[group.category as ArmorSlot];
  return (
    <li className="flex flex-col gap-[0.4rem]">
      <div className="flex min-w-0 items-center gap-[0.6rem]">
        <Icon type={group.category} />
        <Link href={group.href} className="min-w-0 truncate text-white hover:text-stat">
          <h3 className="m-0 truncate font-normal">{label}</h3>
        </Link>
        <span
          className={cn(
            "ml-auto flex-none text-small tabular-nums",
            group.missing === 0 ? "text-positive" : "text-stat",
          )}
        >
          {text.ownedOf(formatNumber(group.owned), formatNumber(group.needed))}
        </span>
      </div>
      <progress
        className={progressBar}
        value={Math.min(group.owned, group.needed)}
        max={group.needed}
        aria-label={text.groupProgress(label, group.owned, group.needed)}
      />
      <span className={cn("text-small", group.missing === 0 ? "text-positive" : "text-stat")}>
        {group.missing === 0 ? text.complete : text.need(group.missing)}
      </span>
      <MissingPieces group={group} />
    </li>
  );
}

/** One equipment award: its progress across the weapon classes or armor slots. */
function AwardSection({
  award,
  title,
  description,
}: {
  award: CollectionAward;
  title: string;
  description?: string;
}) {
  const { t, formatNumber } = useLocale();
  const text = t.site.hunter.collection;
  const complete = award.done === award.total;
  return (
    <section className="flex flex-col gap-[1.2rem]">
      <DetailRule />
      <div className="flex items-baseline gap-[1.6rem]">
        <h2 className="m-0 min-w-0 font-normal text-white">{title}</h2>
        <span
          className={cn(
            "ml-auto flex-none text-small tabular-nums",
            complete ? "text-positive" : "text-stat",
          )}
        >
          {text.awardProgress(formatNumber(award.done), formatNumber(award.total))}
        </span>
      </div>
      {description && <p className="m-0 text-small text-white/60">{description}</p>}
      <progress
        className={progressBar}
        value={award.done}
        max={award.total}
        aria-label={text.awardLabel(title, award.done, award.total)}
      />
      <ul className="m-0 flex list-none flex-col gap-[1.2rem] p-0">
        {award.groups.map((group) => (
          <CollectionGroupRow key={group.category} group={group} />
        ))}
      </ul>
    </section>
  );
}

/**
 * The hunter's equipment box against the Guild Card's equipment collection
 * awards: the Artisan's Hammer's weapon classes and the Artisan's Mitten's
 * armor slots, with their counts and the pieces still to find.
 */
export default function CollectionPage() {
  const { t, formatNumber, game } = useLocale();
  const text = t.site.hunter;
  const { save } = useSave();
  const hasEquipment = save?.equipment !== undefined;
  const { ids, error } = useEquipmentIds(hasEquipment);
  const { awards: awardText } = useAwardText();
  const awards = useMemo(
    () =>
      save?.equipment && ids
        ? [weaponCollectionAward(save.equipment, ids), armorCollectionAward(save.equipment, ids)]
        : null,
    [save, ids],
  );
  if (!save) return <NoHunter />;
  if (!save.equipment) return <CollectionNote>{text.collection.noEquipment}</CollectionNote>;
  if (!awards) {
    return (
      <CollectionNote>{error ? text.collection.failed : text.collection.loading}</CollectionNote>
    );
  }

  const [hammer, mitten] = awards;
  const hammerText = awardText?.[hammer.index];
  const mittenText = awardText?.[mitten.index];
  const hammerTitle = hammerText
    ? game.award(hammer.index, "name", hammerText.name)
    : text.collection.weapons;
  const mittenTitle = mittenText
    ? game.award(mitten.index, "name", mittenText.name)
    : text.collection.armor;
  return (
    <DetailCard>
      <DetailHeader>
        <DetailName>{text.pages.collection}</DetailName>
        <span
          className="ml-auto text-white tabular-nums"
          aria-label={text.collection.piecesLabel(save.equipment.length)}
        >
          {text.collection.pieces(formatNumber(save.equipment.length))}
        </span>
      </DetailHeader>
      <DetailBody>
        <div className="text-small text-white/70">{text.collection.note}</div>
        <AwardSection
          award={hammer}
          title={hammerTitle}
          description={
            hammerText && game.award(hammer.index, "description", hammerText.description)
          }
        />
        <AwardSection
          award={mitten}
          title={mittenTitle}
          description={
            mittenText && game.award(mitten.index, "description", mittenText.description)
          }
        />
        <DetailRule />
        <Link href="/hunter/awards/" className="text-white underline hover:text-stat">
          {text.collection.allAwards}
        </Link>
      </DetailBody>
    </DetailCard>
  );
}
