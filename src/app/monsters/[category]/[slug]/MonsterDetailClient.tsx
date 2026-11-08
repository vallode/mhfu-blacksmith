"use client";

import Link from "next/link";
import { useState } from "react";
import Card from "@/components/Card";
import { DetailBody, DetailCard, DetailRule } from "@/components/DetailPanel";
import TreeScroll from "@/components/TreeScroll";
import { cn } from "@/lib/cn";
import { hitzoneTable } from "@/styles/tables";
import type { MonsterCategory } from "@/lib/constants";
import { useMonster, useMonsterList } from "@/lib/client-data";
import MonsterNav from "@/components/MonsterNav";
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

// Some monsters have no art; keep the layout and hide the broken-image glyph.
const hideBroken: React.ReactEventHandler<HTMLImageElement> = (e) => {
  e.currentTarget.style.visibility = "hidden";
};

export default function MonsterDetailClient({ category, slug }: Props) {
  const { item: monster, loading } = useMonster(category, slug);
  const { items: siblings } = useMonsterList(category);
  const modelUrl = useMonsterModel(monster?.name);
  // Open state is tied to the model, so navigating to another monster closes it.
  const [openModel, setOpenModel] = useState<string | null>(null);
  const modelOpen = modelUrl !== null && openModel === modelUrl;

  if (loading) {
    return (
      <>
        <MonsterNav activeCategory={category} />
        <BorderRule />
        <p style={{ padding: "2rem" }}>Loading…</p>
      </>
    );
  }
  if (!monster) {
    return (
      <>
        <MonsterNav activeCategory={category} />
        <BorderRule />
        <p style={{ padding: "2rem" }}>Not found.</p>
      </>
    );
  }

  const hitzoneEntries = monster.hitzones ? Object.entries(monster.hitzones) : [];

  return (
    <>
      <MonsterNav activeCategory={category} />
      <BorderRule />

      <div className="split-page">
        {/* Monsters of the same type, as navigation */}
        <Card variant="weapon-tree">
          <TreeScroll treeKey={`monsters-${category}`} activeSlug={slug}>
            {siblings?.map((m) => (
              <Link
                key={m.slug}
                id={m.slug}
                href={`/monsters/${category}/${m.slug}/`}
                aria-current={m.slug === slug ? "page" : undefined}
                className={cn("list-row", m.slug === slug && "bg-white/10")}
              >
                <img
                  className="h-[32px] w-[32px] pixelated"
                  src={`/images/monsters/${m.slug}-favicon.png`}
                  alt=""
                  decoding="sync"
                  onError={hideBroken}
                />
                <p>{m.name}</p>
              </Link>
            ))}
          </TreeScroll>
        </Card>

        {/* Detail panel */}
        <DetailCard>
          {/* Name, habitats and description left of the portrait scroll (stacked on phones) */}
          <div className="flex flex-row items-start gap-4 mobile:flex-col-reverse mobile:items-stretch">
            <div className="flex min-w-0 flex-1 flex-col gap-2 text-[2.2rem] text-gold">
              <p className="leading-[1.25]">{monster.name}</p>
              {monster.habitats && <p className="leading-[1.25]">{monster.habitats.join(", ")}</p>}
              {monster.description && (
                <p className="text-[1.6rem] whitespace-normal text-white">{monster.description}</p>
              )}
            </div>
            <div className="flex h-[11.2rem] w-[16.8rem] shrink-0 items-center justify-center bg-[url(/images/scroll.png)] bg-contain bg-center bg-no-repeat pixelated mobile:mx-auto">
              <img
                className="h-[9rem] w-[9rem] object-contain pixelated"
                src={`/images/monsters/${slug}.png`}
                alt={monster.name}
                decoding="sync"
                onError={hideBroken}
              />
            </div>
          </div>

          <DetailBody>
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
