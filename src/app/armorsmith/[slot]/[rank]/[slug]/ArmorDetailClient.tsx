"use client";

import { useState } from "react";
import { useVisibleTree } from "@/hooks/useVisibleTree";
import WeaponTreeRow from "@/components/WeaponTreeRow";
import TreeScroll from "@/components/TreeScroll";
import Card from "@/components/Card";
import ArmorNav from "@/components/ArmorNav";
import ArmorTreePanel from "@/components/ArmorTreePanel";
import Icon from "@/components/Icon";
import {
  DetailBody,
  DetailCard,
  DetailHeader,
  DetailRule,
  MaterialList,
  Requirements,
  Slots,
  Stat,
  StatList,
  StatValue,
} from "@/components/DetailPanel";
import { cn } from "@/lib/cn";
import type { ArmorSlot, ArmorRank } from "@/lib/constants";
import { useArmorPiece } from "@/lib/client-data";
import BorderRule from "@/components/BorderRule";
import ArmorModelViewer from "@/components/ArmorModelViewer";
import ModelPopover, { ModelButton } from "@/components/ModelPopover";
import { useArmorModel } from "@/lib/models";
import Loading from "@/components/Loading";

interface Props {
  slot: ArmorSlot;
  rank: ArmorRank;
  slug: string;
}

export default function ArmorDetailClient({ slot, rank, slug }: Props) {
  const { item: piece, tree, loading } = useArmorPiece(slot, rank, slug);
  const models = useArmorModel(slot, piece?.name, piece?.sex);
  // Open state is tied to the piece, so navigating to another piece closes it.
  const [openModel, setOpenModel] = useState<string | null>(null);
  const modelKey = models ? `${slot}/${piece?.name}` : null;
  const modelOpen = modelKey !== null && openModel === modelKey;

  const basePath = `/armorsmith/${slot}/${rank}/`;
  const visibleTree = useVisibleTree(tree, slot, basePath, slug);

  if (loading || !piece) {
    // Keep the split layout (and the tree card frame) in place while the data
    // bundle loads so the sidebar doesn't flash in once it resolves.
    return (
      <>
        <ArmorNav activeSlot={slot} rank={rank} />
        <BorderRule />
        <div className="split-page">
          <ArmorTreePanel slot={slot} rank={rank}>
            <TreeScroll treeKey={`armor-${slot}-${rank}`} activeSlug={slug}>
              {null}
            </TreeScroll>
          </ArmorTreePanel>
          <Card>{loading ? <Loading>Loading…</Loading> : <p>Not found.</p>}</Card>
        </div>
      </>
    );
  }

  return (
    <>
      <ArmorNav activeSlot={slot} rank={rank} />
      <BorderRule />

      <div className="split-page">
        {visibleTree && (
          <ArmorTreePanel slot={slot} rank={rank}>
            <TreeScroll treeKey={`armor-${slot}-${rank}`} activeSlug={slug}>
              {visibleTree.map((node) => (
                <ul key={node.slug}>
                  <WeaponTreeRow
                    node={node}
                    sectionType={slot}
                    basePath={basePath}
                    treeKey={`armor-${slot}-${rank}`}
                    activeSlug={slug}
                  />
                </ul>
              ))}
            </TreeScroll>
          </ArmorTreePanel>
        )}

        <DetailCard>
          <DetailHeader>
            <Icon type={slot} size="large" alt={piece.name} />
            <p>{piece.name}</p>
            {modelKey && (
              <ModelButton
                open={modelOpen}
                onClick={() => setOpenModel(modelOpen ? null : modelKey)}
                className="ml-[0.4rem]"
              />
            )}
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

            {piece.skills && piece.skills.length > 0 && (
              <div className="flex flex-1 flex-col gap-[13px]">
                <h2 className="m-0 w-full leading-none font-normal">Skills</h2>
                {piece.skills.map((skill, i) => (
                  <div key={i} className="flex">
                    <h3 className="m-0 flex w-cells-10 leading-none font-normal">{skill.name}</h3>
                    <p
                      className={cn(
                        "w-cells-4 text-right",
                        Number(skill.amount) < 0 ? "text-negative" : "text-positive",
                      )}
                    >
                      {skill.amount}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {piece.create_mats && piece.create_mats.length > 0 && (
              <Requirements>
                <MaterialList
                  label="Create cost"
                  cost={piece.create_cost}
                  materials={piece.create_mats}
                />
              </Requirements>
            )}

            {piece.alternative_create_mats && piece.alternative_create_mats.length > 0 && (
              <Requirements>
                <MaterialList
                  label="Create cost"
                  cost={piece.create_cost}
                  materials={piece.alternative_create_mats}
                />
              </Requirements>
            )}
          </DetailBody>
        </DetailCard>
        {modelOpen && models && (
          <ModelPopover title={piece.name} onClose={() => setOpenModel(null)}>
            <ArmorModelViewer models={models} label={piece.name} />
          </ModelPopover>
        )}
      </div>
    </>
  );
}
