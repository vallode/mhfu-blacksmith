"use client";

import Link from "next/link";
import { useState } from "react";
import Card from "@/components/Card";
import { DetailBody, DetailCard, DetailRule } from "@/components/DetailPanel";
import TreeScroll from "@/components/TreeScroll";
import { cn } from "@/lib/cn";
import { hitzoneBest, hitzoneTable, hitzoneZero } from "@/styles/tables";
import type { MonsterCategory } from "@/lib/constants";
import { useMonster, useMonsterList } from "@/lib/client-data";
import MonsterNav from "@/components/MonsterNav";
import BorderRule from "@/components/BorderRule";
import ModelViewer from "@/components/ModelViewer";
import ModelPopover, { ModelButton } from "@/components/ModelPopover";
import MonsterDrops from "@/components/MonsterDrops";
import { useMonsterModel } from "@/lib/models";

interface Props {
  category: MonsterCategory;
  slug: string;
}

const HITZONE_COLS = ["cut", "bash", "shot", "fir", "wtr", "thn", "ice", "drg", "ko"] as const;
// Full label, and the game's abbreviation for phones, where nine columns
// leave no room for "Thunder".
const HITZONE_LABELS: Record<string, [full: string, short: string]> = {
  cut: ["Cut", "Cut"],
  bash: ["Bash", "Bsh"],
  shot: ["Shot", "Sht"],
  fir: ["Fire", "Fir"],
  wtr: ["Water", "Wtr"],
  thn: ["Thunder", "Thn"],
  ice: ["Ice", "Ice"],
  drg: ["Dragon", "Drg"],
  ko: ["KO", "KO"],
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
  // The most effective part per column, to highlight it
  const bestHitzone: Partial<Record<(typeof HITZONE_COLS)[number], number>> = {};
  for (const col of HITZONE_COLS) {
    const values = hitzoneEntries.map(([, v]) => Number(v[col])).filter((n) => n > 0);
    if (values.length > 1) bestHitzone[col] = Math.max(...values);
  }

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
              <div className="flex items-center">
                <p className="leading-[1.25]">{monster.name}</p>
                {modelUrl && (
                  <ModelButton
                    open={modelOpen}
                    onClick={() => setOpenModel(modelOpen ? null : modelUrl)}
                    className="ml-[0.4rem]"
                  />
                )}
              </div>
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
            <DetailRule />

            {hitzoneEntries.length > 0 && (
              <table className={hitzoneTable}>
                <thead>
                  <tr>
                    <th>Part</th>
                    {HITZONE_COLS.map((col) => (
                      <th key={col}>
                        <span className="mobile:hidden">{HITZONE_LABELS[col][0]}</span>
                        <span className="hidden mobile:inline">{HITZONE_LABELS[col][1]}</span>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {hitzoneEntries.map(([part, values]) => (
                    <tr key={part}>
                      <td>{part}</td>
                      {HITZONE_COLS.map((col) => {
                        const value = values[col];
                        const n = Number(value);
                        return (
                          <td
                            key={col}
                            className={cn(
                              value !== undefined && n === 0 && hitzoneZero,
                              value !== undefined && n === bestHitzone[col] && hitzoneBest,
                            )}
                          >
                            {value ?? "—"}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {monster.drops && Object.keys(monster.drops).length > 0 && (
              <>
                <DetailRule />
                {/* Keyed on the monster so the rank tab resets when navigating */}
                <MonsterDrops key={slug} drops={monster.drops} />
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
