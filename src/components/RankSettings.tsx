"use client";

import Card from "@/components/Card";
import { usePreferences } from "@/context/PreferencesContext";
import { GUILD_RANKS, rankName, STAGES, tierLabel } from "@/lib/min-rank";
import * as ui from "@/styles/settings";

const EVERYTHING = "all";
const stageValue = (rank: string, stars: number) => `${rank}:${stars}`;

export default function RankSettings() {
  const { prefs, set } = usePreferences();
  const current = prefs.questProgress;

  return (
    <Card className={ui.section}>
      <h2 className={ui.heading}>Hunter Progress</h2>
      <p className={ui.note}>
        Pick the highest guild quest you can take. Weapons and armor that need materials from later
        quests are hidden. Village quests count as Low Rank.
      </p>

      <label className={ui.status}>
        <span className={ui.statusLabel}>Highest quest available</span>
        <select
          className={ui.select}
          value={current ? stageValue(current.rank, current.stars) : EVERYTHING}
          onChange={(e) => {
            const stage = STAGES.find((s) => stageValue(s.rank, s.stars) === e.target.value);
            set("questProgress", stage ?? null);
          }}
        >
          <option value={EVERYTHING}>Show everything</option>
          {GUILD_RANKS.map((rank) => (
            <optgroup key={rank} label={rankName(rank)}>
              {STAGES.filter((s) => s.rank === rank).map((s) => (
                <option key={s.stars} value={stageValue(s.rank, s.stars)}>
                  {tierLabel(s)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
    </Card>
  );
}
