"use client";

import { useMemo } from "react";
import Icon from "@/components/Icon";
import {
  DetailBody,
  DetailCard,
  DetailHeader,
  DetailName,
  DetailRule,
  MaterialList,
  RequirementsPage,
  RequirementTabs,
  Requirements,
  SkillPoints,
  Slots,
  Stat,
  StatList,
  StatValue,
} from "@/components/DetailPanel";
import { useSave } from "@/context/SaveContext";
import { usePreferences } from "@/context/PreferencesContext";
import { useDecoration } from "@/lib/client-data";
import { attachedDecorationCounts, ownedItemCounts } from "@/lib/hunter-progress";
import Loading from "@/components/Loading";
import { useLocale } from "@/context/LanguageContext";

interface Props {
  slug: string;
}

/** "Fencing +1" → { name: "Fencing", amount: "+1" }. */
function splitSkill(skill: string) {
  const at = skill.lastIndexOf(" ");
  return { name: skill.slice(0, at), amount: skill.slice(at + 1) };
}

export default function DecorationDetailClient({ slug }: Props) {
  const { item: deco, loading } = useDecoration(slug);
  const { t, game, formatNumber } = useLocale();
  const td = t.equipment.detail;
  const tdeco = t.equipment.decoration;
  // With a save loaded: jewels in the item box and pouch, and attached to
  // equipment (unless material counts are off on the Options page).
  const { save } = useSave();
  const { showMaterialCounts } = usePreferences().prefs;
  const counts = useMemo(
    () =>
      showMaterialCounts && save
        ? { box: ownedItemCounts(save)!, attached: attachedDecorationCounts(save)! }
        : null,
    [showMaterialCounts, save],
  );

  // The nav and the list on the left come from the decorations layout
  // (DecorationShell), which stays mounted; this is only the detail panel.
  if (loading || !deco) {
    return (
      <DetailCard>
        {loading ? <Loading>{t.common.loading}</Loading> : <p>{td.notFound}</p>}
      </DetailCard>
    );
  }

  const name = game.name("decoration", deco.name);

  const id = deco.item_id;
  const inBox = counts && id !== undefined ? (counts.box.get(id) ?? 0) : null;
  const attached = counts && id !== undefined ? (counts.attached.get(id) ?? 0) : 0;

  return (
    <DetailCard>
      <DetailHeader>
        <Icon type="decoration" size="large" color={deco.color} alt={name} />
        <DetailName>{name}</DetailName>
      </DetailHeader>

      <DetailBody>
        <StatList>
          <Stat label={td.slots}>
            <Slots count={deco.slots} />
          </Stat>
          {inBox !== null && (
            <Stat label={tdeco.owned}>
              <StatValue>{formatNumber(inBox)}</StatValue>
              {attached > 0 && (
                <StatValue className="ml-[0.8rem] text-muted">
                  {tdeco.attached(formatNumber(attached))}
                </StatValue>
              )}
            </Stat>
          )}
        </StatList>

        {deco.skills && deco.skills.length > 0 && (
          <SkillPoints skills={deco.skills.map(splitSkill)} />
        )}

        <DetailRule />

        {/* A jewel with two recipes: the second is its own tab, as on armor. */}
        <Requirements>
          <RequirementTabs
            key={slug}
            label={tdeco.recipesLabel(name)}
            tabs={[deco.create_mats, deco.alternative_create_mats].map(
              (materials, i) =>
                materials &&
                materials.length > 0 && {
                  id: i === 0 ? "create" : "alt-recipe",
                  label: i === 0 ? td.createCost : td.altRecipe,
                  content: (
                    <RequirementsPage>
                      <MaterialList
                        label={td.createCost}
                        cost={deco.create_cost}
                        materials={materials}
                      />
                    </RequirementsPage>
                  ),
                },
            )}
          />
        </Requirements>
      </DetailBody>
    </DetailCard>
  );
}
