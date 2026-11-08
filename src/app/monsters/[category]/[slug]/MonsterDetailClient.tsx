"use client";

import Link from "next/link";
import { useState } from "react";
import Card from "@/components/Card";
import Icon from "@/components/Icon";
import { DetailBody, DetailCard, DetailRule } from "@/components/DetailPanel";
import { monsterPortrait } from "@/lib/icon-style";
import { hitzoneTable } from "@/styles/tables";
import type { MonsterCategory } from "@/lib/constants";
import { useMonster } from "@/lib/client-data";
import BorderRule from "@/components/BorderRule";
import ModelViewer from "@/components/ModelViewer";
import ModelPopover, { ModelButton } from "@/components/ModelPopover";
import { useMonsterModel } from "@/lib/models";

interface Props {
  category: MonsterCategory;
  slug: string;
}

const HITZONE_COLS = ["cut", "bash", "shot", "fir", "wtr", "thn", "ice", "drg", "ko"] as const;
const HITZONE_LABELS: Record<string, string> = {
  cut: "Cut",
  bash: "Bash",
  shot: "Shot",
  fir: "Fire",
  wtr: "Water",
  thn: "Thunder",
  ice: "Ice",
  drg: "Dragon",
  ko: "KO",
};

export default function MonsterDetailClient({ category, slug }: Props) {
  const { item: monster, loading } = useMonster(category, slug);
  const modelUrl = useMonsterModel(monster?.name);
  // Open state is tied to the model, so navigating to another monster closes it.
  const [openModel, setOpenModel] = useState<string | null>(null);
  const modelOpen = modelUrl !== null && openModel === modelUrl;

  if (loading) {
    return (
      <>
        <nav className="flex w-full items-center justify-start mobile:flex-wrap mobile:justify-center">
          <div>
            <Link href={`/monsters/${category}/`} aria-label="Back">
              <Icon type="arrow" nav alt="Back" />
            </Link>
          </div>
        </nav>
        <BorderRule />
        <p style={{ padding: "2rem" }}>Loading…</p>
      </>
    );
  }
  if (!monster) {
    return (
      <>
        <nav className="flex w-full items-center justify-start mobile:flex-wrap mobile:justify-center">
          <div>
            <Link href={`/monsters/${category}/`} aria-label="Back">
              <Icon type="arrow" nav alt="Back" />
            </Link>
          </div>
        </nav>
        <BorderRule />
        <p style={{ padding: "2rem" }}>Not found.</p>
      </>
    );
  }

  const hitzoneEntries = monster.hitzones ? Object.entries(monster.hitzones) : [];

  return (
    <>
      <nav className="flex w-full items-center justify-start mobile:flex-wrap mobile:justify-center">
        <div>
          <Link href={`/monsters/${category}/`} aria-label="Back">
            <Icon type="arrow" nav alt="Back" />
          </Link>
        </div>
      </nav>
      <BorderRule />

      <div className="split-page">
        {/* Monster list sidebar */}
        <Card variant="weapon-tree">
          <Icon
            type={category}
            size="large"
            monster
            imgSrc={`/images/monsters/${slug}.png`}
            alt={monster.name}
          />
        </Card>

        {/* Detail panel */}
        <DetailCard>
          {/* Name and habitats beside the portrait (stacked under it on phones) */}
          <div className="relative flex h-auto flex-[0_0_11rem] flex-row items-start text-[2.2rem] text-gold no-underline mobile:flex-col-reverse mobile:flex-wrap">
            <div className="flex flex-col">
              <p className="leading-[1.25]">{monster.name}</p>
              {monster.habitats && <p className="leading-[1.25]">{monster.habitats.join(", ")}</p>}
            </div>
            <Icon
              type={category}
              monster
              imgSrc={`/images/monsters/${slug}.png`}
              alt={monster.name}
              className={monsterPortrait}
            />
          </div>

          <DetailBody>
            {monster.description && (
              <p className="text-[1.6rem] whitespace-normal text-white">{monster.description}</p>
            )}

            {modelUrl && (
              <ModelButton
                open={modelOpen}
                onClick={() => setOpenModel(modelOpen ? null : modelUrl)}
              />
            )}

            <DetailRule />

            {hitzoneEntries.length > 0 && (
              <table className={hitzoneTable}>
                <thead>
                  <tr>
                    <th>Part</th>
                    {HITZONE_COLS.map((col) => (
                      <th key={col}>{HITZONE_LABELS[col]}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hitzoneEntries.map(([part, values]) => (
                    <tr key={part}>
                      <td>{part}</td>
                      {HITZONE_COLS.map((col) => (
                        <td key={col}>{values[col] ?? "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {monster.drops && (
              <>
                <DetailRule />
                {Object.entries(monster.drops).map(([rankName, rankDrops]) => (
                  <div key={rankName}>
                    <Card>
                      <p>
                        <span>{rankName}</span>
                      </p>
                      {Object.entries(rankDrops).map(([source, items]) => (
                        <div key={source}>
                          <p>{source}</p>
                          {items.map((drop, i) => (
                            <p key={i}>
                              {drop.name}: {drop.chance}
                            </p>
                          ))}
                        </div>
                      ))}
                    </Card>
                  </div>
                ))}
              </>
            )}
          </DetailBody>
        </DetailCard>
        {modelOpen && (
          <ModelPopover title={monster.name} onClose={() => setOpenModel(null)}>
            <ModelViewer src={modelUrl} label={monster.name} />
          </ModelPopover>
        )}
      </div>
    </>
  );
}
