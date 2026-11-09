"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Card from "@/components/Card";
import { DetailBody, DetailCard, DetailRule } from "@/components/DetailPanel";
import TreeScroll from "@/components/TreeScroll";
import { cn } from "@/lib/cn";
import { hitzoneBest, hitzoneTable, hitzoneZero } from "@/styles/tables";
import type { MonsterCategory } from "@/lib/constants";
import { useMonster, useMonsterList, useQuests } from "@/lib/client-data";
import MonsterNav from "@/components/MonsterNav";
import BorderRule from "@/components/BorderRule";
import ModelViewer, { type ModelCapsule } from "@/components/ModelViewer";
import HitzoneControls, { type HitzonePart } from "@/components/HitzoneControls";
import ModelPopover, { ModelButton } from "@/components/ModelPopover";
import MonsterDrops from "@/components/MonsterDrops";
import MonsterQuests from "@/components/MonsterQuests";
import Tabs, { type Tab } from "@/components/Tabs";
import { formatRank } from "@/lib/monster-drops";
import { questsWithMonster } from "@/lib/quests";
import { useMonsterHitboxes, useMonsterModel } from "@/lib/models";
import Loading from "@/components/Loading";

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

/** A hitzone part's colour on the model, by its place in the hitzone table. */
const hitboxColor = (index: number) => `var(--color-hitbox-${(index % 8) + 1})`;

/** Hitbox opacity: all shown, a highlighted part, and the rest while one is highlighted. */
const HITBOX_OPACITY = { shown: 0.35, highlighted: 0.6, dimmed: 0.08 };

/** Sizes are stored to two decimals; whole centimetres are enough here. */
const formatSize = (cm: number) => Math.round(cm).toLocaleString("en-US");

// Some monsters have no art; keep the layout and hide the broken-image glyph.
const hideBroken: React.ReactEventHandler<HTMLImageElement> = (e) => {
  e.currentTarget.style.visibility = "hidden";
};

export default function MonsterDetailClient({ category, slug }: Props) {
  const { item: monster, loading } = useMonster(category, slug);
  const { items: siblings } = useMonsterList(category);
  const modelUrl = useMonsterModel(monster?.name);
  const { quests } = useQuests();
  // Open state is tied to the model, so navigating to another monster closes it.
  const [openModel, setOpenModel] = useState<string | null>(null);
  const modelOpen = modelUrl !== null && openModel === modelUrl;
  const hitboxes = useMonsterHitboxes(modelUrl);
  const [showHitzones, setShowHitzones] = useState(false);
  // A part hovered in the hitzone table or the legend, and one picked in the
  // legend (which only shows with the hitboxes, so a pick ends with them).
  const [hoveredPart, setHoveredPart] = useState<string | null>(null);
  const [pinnedPart, setPinnedPart] = useState<string | null>(null);
  const highlight = hoveredPart ?? (showHitzones ? pinnedPart : null);

  // Hitzone parts that have hitboxes, coloured by their place in the table.
  const hitboxParts = useMemo<HitzonePart[]>(() => {
    if (!hitboxes || !monster?.hitzones) return [];
    return Object.keys(monster.hitzones)
      .map((name, i) => ({ name, color: hitboxColor(i) }))
      .filter(({ name }) => hitboxes.some((capsule) => capsule.parts.includes(name)));
  }, [hitboxes, monster?.hitzones]);

  const capsules = useMemo<ModelCapsule[]>(() => {
    if (!hitboxes || (!showHitzones && !highlight)) return [];
    return hitboxes.map((capsule) => {
      const part = hitboxParts.find(({ name }) => capsule.parts.includes(name));
      const opacity = !highlight
        ? HITBOX_OPACITY.shown
        : capsule.parts.includes(highlight)
          ? HITBOX_OPACITY.highlighted
          : showHitzones
            ? HITBOX_OPACITY.dimmed
            : 0;
      return { ...capsule, color: part?.color ?? "var(--color-unavailable)", opacity };
    });
  }, [hitboxes, hitboxParts, showHitzones, highlight]);

  if (loading) {
    return (
      <>
        <MonsterNav activeCategory={category} />
        <BorderRule />
        <Loading className="p-[2rem]">Loading…</Loading>
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

  // While the model shows hitboxes, part names take their hitbox colour as a legend.
  const partColor = (part: string) =>
    modelOpen && (showHitzones || highlight)
      ? hitboxParts.find(({ name }) => name === part)?.color
      : undefined;

  const hitzoneTab: Tab[] =
    hitzoneEntries.length > 0
      ? [
          {
            id: "hitzones",
            label: "Hitzones",
            content: (
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
                    <tr
                      key={part}
                      // With the model open, hovering a part highlights its hitboxes.
                      onPointerEnter={(e) =>
                        modelOpen && e.pointerType === "mouse" && setHoveredPart(part)
                      }
                      onPointerLeave={() => setHoveredPart(null)}
                      className={cn(modelOpen && hoveredPart === part && "bg-white/10")}
                    >
                      <td style={{ color: partColor(part) }}>{part}</td>
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
            ),
          },
        ]
      : [];
  // One tab per rank's drop tables
  const dropTabs: Tab[] = Object.entries(monster.drops ?? {}).map(([rank, sources]) => ({
    id: rank,
    label: formatRank(rank),
    content: <MonsterDrops sources={sources} />,
  }));
  const monsterQuests = quests ? questsWithMonster(quests, monster.name) : [];
  const questTab: Tab[] =
    monsterQuests.length > 0
      ? [{ id: "quests", label: "Quests", content: <MonsterQuests quests={monsterQuests} /> }]
      : [];
  const tabs = [...hitzoneTab, ...dropTabs, ...questTab];

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
              {monster.sizes && (
                <p className="text-[1.6rem] text-stat">
                  Size:{" "}
                  <span className="text-white tabular-nums">
                    {formatSize(monster.sizes.min)}–{formatSize(monster.sizes.max)} cm
                  </span>
                </p>
              )}
              {monster.base_hp !== undefined && (
                <p className="text-[1.6rem] text-stat">
                  Base HP:{" "}
                  <span className="text-white tabular-nums">
                    {monster.base_hp.toLocaleString("en-US")}
                  </span>
                </p>
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
            {/* Keyed on the monster so the selected tab resets when navigating */}
            {tabs.length > 0 && <Tabs key={slug} label={`${monster.name} data`} tabs={tabs} />}
          </DetailBody>
        </DetailCard>
        {modelOpen && (
          <ModelPopover title={monster.name} onClose={() => setOpenModel(null)}>
            <div className="relative h-full w-full">
              <ModelViewer src={modelUrl} label={monster.name} capsules={capsules} />
              {hitboxParts.length > 0 && (
                <HitzoneControls
                  parts={hitboxParts}
                  show={showHitzones}
                  onShowChange={setShowHitzones}
                  pinned={pinnedPart}
                  onPin={setPinnedPart}
                  onHover={setHoveredPart}
                />
              )}
            </div>
          </ModelPopover>
        )}
      </div>
    </>
  );
}
