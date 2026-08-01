"use client";

import Link from "next/link";
import Card from "@/components/Card";
import Icon from "@/components/Icon";
import cardStyles from "@/styles/weapon-card.module.scss";
import type { MonsterCategory } from "@/lib/constants";
import { useMonster } from "@/lib/client-data";

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

  if (loading) {
    return (
      <>
        <nav className="weapon-navigation">
          <div>
            <Link href={`/monsters/${category}/`} aria-label="Back">
              <Icon type="arrow" nav alt="Back" />
            </Link>
          </div>
        </nav>
        <hr className="border" />
        <p style={{ padding: "2rem" }}>Loading…</p>
      </>
    );
  }
  if (!monster) {
    return (
      <>
        <nav className="weapon-navigation">
          <div>
            <Link href={`/monsters/${category}/`} aria-label="Back">
              <Icon type="arrow" nav alt="Back" />
            </Link>
          </div>
        </nav>
        <hr className="border" />
        <p style={{ padding: "2rem" }}>Not found.</p>
      </>
    );
  }

  const hitzoneEntries = monster.hitzones
    ? Object.entries(monster.hitzones)
    : [];

  return (
    <>
      <nav className="weapon-navigation">
        <div>
          <Link href={`/monsters/${category}/`} aria-label="Back">
            <Icon type="arrow" nav alt="Back" />
          </Link>
        </div>
      </nav>
      <hr className="border" />

      <div className="weapon-details-page">
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
        <Card className={cardStyles["weapon-card"]}>
          <div className={`${cardStyles["weapon-card__header"]} ${cardStyles["weapon-card__header--monster"]}`}>
            <div className="details">
              <p>{monster.name}</p>
              {monster.habitats && (
                <p>
                  {monster.habitats.join(", ")}
                </p>
              )}
            </div>
            <Icon
              type={category}
              monster
              imgSrc={`/images/monsters/${slug}.png`}
              alt={monster.name}
            />
          </div>

          <div className={cardStyles["weapon-card__details"]}>
            {monster.description && (
              <p className="description">{monster.description}</p>
            )}

            <hr />

            {hitzoneEntries.length > 0 && (
              <table className="monster-hz">
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
                <hr />
                {Object.entries(monster.drops).map(([rankName, rankDrops]) => (
                  <div key={rankName} className="requirements--monster">
                    <Card>
                      <p><span>{rankName}</span></p>
                      {Object.entries(rankDrops).map(([source, items]) => (
                        <div key={source}>
                          <p>{source}</p>
                          {items.map((drop, i) => (
                            <p key={i}>{drop.name}: {drop.chance}</p>
                          ))}
                        </div>
                      ))}
                    </Card>
                  </div>
                ))}
              </>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
