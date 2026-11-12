"use client";

import { useMemo } from "react";
import Card from "@/components/Card";
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
    return <Card>{loading ? <Loading>Loading…</Loading> : <p>Not found.</p>}</Card>;
  }

  const id = deco.item_id;
  const inBox = counts && id !== undefined ? (counts.box.get(id) ?? 0) : null;
  const attached = counts && id !== undefined ? (counts.attached.get(id) ?? 0) : 0;

  return (
    <DetailCard>
      <DetailHeader>
        <Icon type="decoration" size="large" color={deco.color} alt={deco.name} />
        <DetailName>{deco.name}</DetailName>
      </DetailHeader>

      <DetailBody>
        <StatList>
          <Stat label="Slots:">
            <Slots count={deco.slots} />
          </Stat>
          {inBox !== null && (
            <Stat label="Owned:">
              <StatValue>{inBox}</StatValue>
              {attached > 0 && (
                <StatValue className="ml-[0.8rem] text-muted">+{attached} attached</StatValue>
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
            label={`${deco.name} recipes`}
            tabs={[deco.create_mats, deco.alternative_create_mats].map(
              (materials, i) =>
                materials &&
                materials.length > 0 && {
                  id: i === 0 ? "create" : "alt-recipe",
                  label: i === 0 ? "Create cost" : "Alt. Recipe",
                  content: (
                    <RequirementsPage>
                      <MaterialList
                        label="Create cost"
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
