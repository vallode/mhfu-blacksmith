"use client";

import Card from "@/components/Card";
import Icon from "@/components/Icon";
import {
  DetailBody,
  DetailCard,
  DetailHeader,
  DetailName,
  DetailRule,
  MaterialList,
  Requirements,
  Slots,
  Stat,
  StatList,
  StatValue,
} from "@/components/DetailPanel";
import { cn } from "@/lib/cn";
import { useDecoration } from "@/lib/client-data";
import Loading from "@/components/Loading";
import { useGameText, useT } from "@/context/LanguageContext";
import type { GameText } from "@/lib/i18n/game-text";

/**
 * A decoration's skill line ("Attack +1") in the site's language: the whole
 * line if the game text has it, else the skill tree's name and the points.
 */
function skillLine(game: GameText, skill: string): string {
  const whole = game.name("skill", skill);
  if (whole !== skill) return whole;
  const match = /^(.*?) ([+-]?\d+)$/.exec(skill);
  return match ? `${game.name("skill", match[1]!)} ${match[2]}` : skill;
}

interface Props {
  slug: string;
}

export default function DecorationDetailClient({ slug }: Props) {
  const { item: deco, loading } = useDecoration(slug);
  const t = useT();
  const game = useGameText();

  // The nav and the tree on the left come from the decorations layout
  // (DecorationShell), which stays mounted; this is only the detail panel.
  if (loading || !deco) {
    return (
      <Card>
        {loading ? <Loading>{t.common.loading}</Loading> : <p>{t.equipment.detail.notFound}</p>}
      </Card>
    );
  }

  const name = game.name("decoration", deco.name);

  return (
    <DetailCard>
      <DetailHeader>
        <Icon type="decoration" size="large" color={deco.color} alt={name} />
        <DetailName>{name}</DetailName>
      </DetailHeader>

      <DetailBody>
        <StatList>
          <Stat label={t.equipment.detail.slots}>
            <Slots count={deco.slots} />
          </Stat>
          {deco.category && (
            <Stat label={t.equipment.decoration.category}>
              <StatValue>{game.name("skill", deco.category)}</StatValue>
            </Stat>
          )}
        </StatList>

        {deco.skills && deco.skills.length > 0 && (
          <>
            <DetailRule />
            <div className="flex flex-1 flex-col gap-[13px]">
              {deco.skills.map((skill, i) => (
                <p key={i} className={cn("whitespace-normal", i === 0 && "w-full font-normal")}>
                  {skillLine(game, skill)}
                </p>
              ))}
            </div>
          </>
        )}

        {deco.create_mats && deco.create_mats.length > 0 && (
          <Requirements>
            <MaterialList
              label={t.equipment.detail.createCost}
              cost={deco.create_cost}
              materials={deco.create_mats}
            />
          </Requirements>
        )}
      </DetailBody>
    </DetailCard>
  );
}
