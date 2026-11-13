"use client";

import { useState } from "react";
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
import type { ArmorSlot, ArmorRank } from "@/lib/constants";
import { useArmorPiece } from "@/lib/client-data";
import ArmorModelViewer from "@/components/ArmorModelViewer";
import ModelPopover, { ModelButton } from "@/components/ModelPopover";
import { useArmorModel } from "@/lib/models";
import Loading from "@/components/Loading";
import WishlistButton from "@/components/WishlistButton";

interface Props {
  slot: ArmorSlot;
  rank: ArmorRank;
  slug: string;
}

export default function ArmorDetailClient({ slot, rank, slug }: Props) {
  const { item: piece, loading } = useArmorPiece(slot, rank, slug);
  const models = useArmorModel(slot, piece?.name, piece?.sex);
  // Open state is tied to the piece, so navigating to another piece closes it.
  const [openModel, setOpenModel] = useState<string | null>(null);
  const modelKey = models ? `${slot}/${piece?.name}` : null;
  const modelOpen = modelKey !== null && openModel === modelKey;

  // The nav and the tree on the left come from the armorsmith layout
  // (ArmorShell), which stays mounted; this is only the detail panel.
  if (loading || !piece) {
    return <DetailCard>{loading ? <Loading>Loading…</Loading> : <p>Not found.</p>}</DetailCard>;
  }

  return (
    <>
      <DetailCard>
        <DetailHeader>
          <Icon type={slot} size="large" alt={piece.name} />
          <DetailName>{piece.name}</DetailName>
          {modelKey && (
            <ModelButton
              open={modelOpen}
              onClick={() => setOpenModel(modelOpen ? null : modelKey)}
              className="ml-[0.4rem]"
            />
          )}
          <WishlistButton
            gear={{ kind: "armor", slot, rank, slug }}
            name={piece.name}
            className={modelKey ? undefined : "ml-[0.4rem]"}
          />
          {(piece.sex || piece.hunter_type) && (
            <div className="ml-[1.6rem] flex flex-wrap gap-x-[1.6rem] mobile:ml-0">
              {piece.sex && <span>{piece.sex}</span>}
              {piece.hunter_type && <span>{piece.hunter_type}</span>}
            </div>
          )}
        </DetailHeader>

        <DetailBody>
          <StatList armor>
            <Stat armor label="Defence:">
              <StatValue>{piece.defence}</StatValue>
            </Stat>
            {piece.max_defence !== undefined && (
              <Stat armor label="Max defence:">
                {piece.max_defence_pre_ukanlos !== undefined &&
                piece.max_defence_pre_ukanlos !== piece.max_defence ? (
                  <>
                    <StatValue>{piece.max_defence_pre_ukanlos}</StatValue>
                    <StatValue className="ml-(--cell) opacity-20">[{piece.max_defence}]</StatValue>
                  </>
                ) : (
                  <StatValue>{piece.max_defence}</StatValue>
                )}
              </Stat>
            )}
            <Stat armor label="Slots:">
              <Slots count={piece.slots} />
            </Stat>
            {piece.fire_res !== undefined && (
              <Stat armor label="Fire res:">
                <StatValue>{piece.fire_res}</StatValue>
              </Stat>
            )}
            {piece.water_res !== undefined && (
              <Stat armor label="Water res:">
                <StatValue>{piece.water_res}</StatValue>
              </Stat>
            )}
            {piece.thunder_res !== undefined && (
              <Stat armor label="Thunder res:">
                <StatValue>{piece.thunder_res}</StatValue>
              </Stat>
            )}
            {piece.ice_res !== undefined && (
              <Stat armor label="Ice res:">
                <StatValue>{piece.ice_res}</StatValue>
              </Stat>
            )}
            {piece.dragon_res !== undefined && (
              <Stat armor label="Dragon res:">
                <StatValue>{piece.dragon_res}</StatValue>
              </Stat>
            )}
          </StatList>

          <DetailRule />

          {/* One tab per page: skills, create cost, alternative recipe */}
          <Requirements>
            <RequirementTabs
              key={slug}
              label={`${piece.name} details`}
              tabs={[
                piece.skills &&
                  piece.skills.length > 0 && {
                    id: "skills",
                    label: "Skills",
                    content: (
                      <RequirementsPage>
                        <SkillPoints skills={piece.skills} />
                      </RequirementsPage>
                    ),
                  },
                piece.create_mats &&
                  piece.create_mats.length > 0 && {
                    id: "create",
                    label: "Create cost",
                    content: (
                      <RequirementsPage>
                        <MaterialList
                          label="Create cost"
                          cost={piece.create_cost}
                          materials={piece.create_mats}
                        />
                      </RequirementsPage>
                    ),
                  },
                piece.alternative_create_mats &&
                  piece.alternative_create_mats.length > 0 && {
                    id: "alt-recipe",
                    label: "Alt. Recipe",
                    content: (
                      <RequirementsPage>
                        <MaterialList
                          label="Create cost"
                          cost={piece.create_cost}
                          materials={piece.alternative_create_mats}
                        />
                      </RequirementsPage>
                    ),
                  },
              ]}
            />
          </Requirements>
        </DetailBody>
      </DetailCard>
      {modelOpen && models && (
        <ModelPopover title={piece.name} onClose={() => setOpenModel(null)}>
          <ArmorModelViewer models={models} slot={slot} label={piece.name} />
        </ModelPopover>
      )}
    </>
  );
}
