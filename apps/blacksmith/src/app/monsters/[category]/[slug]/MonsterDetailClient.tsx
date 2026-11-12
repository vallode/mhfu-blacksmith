"use client";

import { useMemo, useState } from "react";
import { DetailBody, DetailCard, DetailRule } from "@/components/DetailPanel";
import { cn } from "@/lib/cn";
import { hitzoneBest, hitzoneTable, hitzoneZero } from "@/styles/tables";
import type { MonsterCategory } from "@/lib/constants";
import { useMonster, useQuests } from "@/lib/client-data";
import ModelViewer, { type ModelCapsule } from "@/components/ModelViewer";
import HitzoneControls, { type HitzonePart } from "@/components/HitzoneControls";
import MonsterBreaks from "@/components/MonsterBreaks";
import ModelPopover, { ModelButton } from "@/components/ModelPopover";
import MonsterDrops from "@/components/MonsterDrops";
import MonsterQuests from "@/components/MonsterQuests";
import SmallMonsterQuests from "@/components/SmallMonsterQuests";
import Tabs, { type Tab } from "@/components/Tabs";
import { breakIndex, breakKey } from "@/lib/monster-breaks";
import { formatRank } from "@/lib/monster-drops";
import { monsterRecordFor } from "@/lib/monster-ids";
import { clearedQuestIds, questsWithMonster, smallMonsterStages } from "@/lib/quests";
import { usePreferences } from "@/context/PreferencesContext";
import { useSave } from "@/context/SaveContext";
import { useMonsterHitboxes, useMonsterModel, type HitboxCapsule } from "@/lib/models";
import type { MonsterBreak } from "@/lib/types";
import Loading from "@/components/Loading";

interface Props {
  category: MonsterCategory;
  slug: string;
}

const HITZONE_COLS = ["cut", "bash", "shot", "fir", "wtr", "thn", "ice", "drg", "ko"] as const;
// The game's abbreviated column headers.
const HITZONE_LABELS: Record<string, string> = {
  cut: "Cut",
  bash: "Bsh",
  shot: "Sht",
  fir: "Fir",
  wtr: "Wtr",
  thn: "Thn",
  ice: "Ice",
  drg: "Drg",
  ko: "KO",
};

/** A hitzone part's colour on the model, by its place in the hitzone table. */
const hitboxColor = (index: number) => `var(--color-hitbox-${(index % 8) + 1})`;

/**
 * The flinch column is wider than the value columns: it can hold a range
 * ("100–160"). A phone has no room for it; there the value goes under the
 * part name (`flinchBelow`).
 */
const flinchColumn = "w-cells-8 mobile:hidden";
const flinchBelow = "hidden text-fine text-muted mobile:block";

/** Hitbox opacity: all shown, a highlighted part, and the rest while one is highlighted. */
const HITBOX_OPACITY = { shown: 0.35, highlighted: 0.6, dimmed: 0.08 };

/** Whether a capsule belongs to a highlight key: a hitzone part name, or a break's `breakKey`. */
function capsuleMatches(capsule: HitboxCapsule, key: string, breaks: MonsterBreak[]): boolean {
  const index = breakIndex(key);
  if (index === null) return capsule.parts.includes(key);
  return breaks[index]?.parts.includes(capsule.part) ?? false;
}

const NO_BREAKS: MonsterBreak[] = [];

/** Sizes are stored to two decimals; whole centimetres are enough here. */
const formatSize = (cm: number) => Math.round(cm).toLocaleString("en-US");

// Some monsters have no art; keep the layout and hide the broken-image glyph.
const hideBroken: React.ReactEventHandler<HTMLImageElement> = (e) => {
  e.currentTarget.style.visibility = "hidden";
};

export default function MonsterDetailClient({ category, slug }: Props) {
  const { item: monster, loading } = useMonster(category, slug);
  const modelUrl = useMonsterModel(monster?.name);
  const { quests } = useQuests();
  const { save } = useSave();
  const { markCleared, showHuntRecords } = usePreferences().prefs;
  // Open state is tied to the model, so navigating to another monster closes it.
  const [openModel, setOpenModel] = useState<string | null>(null);
  const modelOpen = modelUrl !== null && openModel === modelUrl;
  const hitboxes = useMonsterHitboxes(modelUrl);
  const [showHitzones, setShowHitzones] = useState(false);
  // A part or break hovered in the hitzone tab or the legend, and one picked
  // in the legend (which only shows with the hitboxes, so a pick ends with
  // them). Hitzone parts go by name, breaks by `breakKey`.
  const [hoveredPart, setHoveredPart] = useState<string | null>(null);
  const [pinnedPart, setPinnedPart] = useState<string | null>(null);
  const highlight = hoveredPart ?? (showHitzones ? pinnedPart : null);

  const breaks = monster?.breaks ?? NO_BREAKS;

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
        : capsuleMatches(capsule, highlight, breaks)
          ? HITBOX_OPACITY.highlighted
          : showHitzones
            ? HITBOX_OPACITY.dimmed
            : 0;
      return { ...capsule, color: part?.color ?? "var(--color-unavailable)", opacity };
    });
  }, [hitboxes, hitboxParts, showHitzones, highlight, breaks]);

  // The hitzone parts each break's hitboxes belong to, in table order.
  const breakHitzones = useMemo<string[][]>(() => {
    if (!hitboxes || !monster?.hitzones) return [];
    const order = Object.keys(monster.hitzones);
    return breaks.map((b) =>
      order.filter((name) =>
        hitboxes.some((c) => b.parts.includes(c.part) && c.parts.includes(name)),
      ),
    );
  }, [hitboxes, monster?.hitzones, breaks]);

  // The nav and the list of monsters on the left come from the monsters
  // layout (MonsterShell), which stays mounted; this is only the detail panel.
  if (loading || !monster) {
    return <DetailCard>{loading ? <Loading>Loading…</Loading> : <p>Not found.</p>}</DetailCard>;
  }

  const hitzoneEntries = monster.hitzones ? Object.entries(monster.hitzones) : [];
  // Each hitzone row's flinch threshold, worked out by the data build; no
  // column for a monster without hitboxes or thresholds.
  const flinchByRow = monster.hitzone_flinch;
  // The most effective part per column, to highlight it
  const bestHitzone: Partial<Record<(typeof HITZONE_COLS)[number], number>> = {};
  for (const col of HITZONE_COLS) {
    const values = hitzoneEntries.map(([, v]) => Number(v[col])).filter((n) => n > 0);
    if (values.length > 1) bestHitzone[col] = Math.max(...values);
  }

  const breakable = new Set(breakHitzones.flat());

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
              <>
                <table className={hitzoneTable}>
                  <thead>
                    <tr>
                      <th>
                        Part
                        {flinchByRow && <span className={flinchBelow}>Fln</span>}
                      </th>
                      {HITZONE_COLS.map((col) => (
                        <th key={col}>{HITZONE_LABELS[col]}</th>
                      ))}
                      {flinchByRow && <th className={flinchColumn}>Fln</th>}
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
                        <td style={{ color: partColor(part) }}>
                          {part}
                          {breakable.has(part) && (
                            <span className="ml-[0.4rem] text-fine text-gold" title="Breakable">
                              ◆<span className="sr-only"> (breakable)</span>
                            </span>
                          )}
                          {flinchByRow?.[part] && (
                            <span className={flinchBelow}>{flinchByRow[part]}</span>
                          )}
                        </td>
                        {HITZONE_COLS.map((col) => {
                          const value = values[col];
                          const n = Number(value);
                          return (
                            <td
                              key={col}
                              className={cn(
                                value !== undefined && n === 0 && hitzoneZero,
                                value !== undefined && n === bestHitzone[col] && hitzoneBest,
                                // On a phone KO ends the row (the flinch column is hidden).
                                col === "ko" && flinchByRow && "mobile:after:hidden",
                              )}
                            >
                              {value ?? "—"}
                            </td>
                          );
                        })}
                        {flinchByRow && (
                          <td className={flinchColumn}>{flinchByRow[part] ?? "—"}</td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {breaks.length > 0 && (
                  <MonsterBreaks
                    breaks={breaks}
                    hitzones={breakHitzones}
                    highlight={modelOpen ? hoveredPart : null}
                    onHover={modelOpen ? setHoveredPart : undefined}
                  />
                )}
              </>
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
  const cleared = markCleared ? clearedQuestIds(save) : null;
  const questTab: Tab[] =
    monsterQuests.length > 0
      ? [
          {
            id: "quests",
            label: "Quests",
            content: <MonsterQuests quests={monsterQuests} cleared={cleared} />,
          },
        ]
      : [];
  const stages = quests ? smallMonsterStages(quests, monster.name) : [];
  const spawnTab: Tab[] =
    stages.length > 0
      ? [
          {
            id: "spawns",
            label: "Most plentiful",
            content: <SmallMonsterQuests stages={stages} />,
          },
        ]
      : [];
  // The loaded hunter's Guild Card counts. Only large monsters (the ones with
  // sizes) can be captured.
  const record = showHuntRecords ? monsterRecordFor(save?.monsters, monster.name) : null;
  const tabs = [...hitzoneTab, ...dropTabs, ...questTab, ...spawnTab];

  return (
    <>
      {/* Detail panel */}
      <DetailCard>
        {/* Name, habitats and description left of the portrait scroll (stacked on phones) */}
        <div className="flex flex-row items-start gap-4 mobile:flex-col-reverse mobile:items-stretch">
          <div className="flex min-w-0 flex-1 flex-col gap-2 text-main text-gold">
            <div className="flex items-center">
              <p className="min-w-0 leading-[1.25] whitespace-normal">{monster.name}</p>
              {modelUrl && (
                <ModelButton
                  open={modelOpen}
                  onClick={() => setOpenModel(modelOpen ? null : modelUrl)}
                  className="ml-[0.4rem]"
                />
              )}
            </div>
            {monster.habitats && (
              <p className="leading-[1.25] whitespace-normal">{monster.habitats.join(", ")}</p>
            )}
            {monster.description && (
              <p className="text-small leading-[1.4] whitespace-normal text-white">
                {monster.description}
              </p>
            )}
            {monster.sizes && (
              <p className="text-small text-stat">
                Size:{" "}
                <span className="text-white tabular-nums">
                  {formatSize(monster.sizes.min)}–{formatSize(monster.sizes.max)} cm
                </span>
              </p>
            )}
            {monster.base_hp !== undefined && (
              <p className="text-small text-stat">
                Base HP:{" "}
                <span className="text-white tabular-nums">
                  {monster.base_hp.toLocaleString("en-US")}
                </span>
              </p>
            )}
            {record && (
              <p className="text-small whitespace-normal text-stat">
                Hunted: <span className="text-white tabular-nums">{record.kills}</span>
                {monster.sizes && (
                  <>
                    {" · "}Captured:{" "}
                    <span className="text-white tabular-nums">{record.captures}</span>
                  </>
                )}
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
                breaks={breaks
                  .map((b, i) => ({ key: breakKey(i), name: b.name }))
                  .filter((_, i) => (breakHitzones[i]?.length ?? 0) > 0)}
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
    </>
  );
}
