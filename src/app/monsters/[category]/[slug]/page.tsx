import Link from "next/link";
import { notFound } from "next/navigation";
import { getMonsters, getMonster } from "@/lib/monsters";
import { MONSTER_CATEGORIES, type MonsterCategory } from "@/lib/constants";
import Card from "@/components/Card";
import cardStyles from "@/styles/weapon-card.module.scss";
import tableStyles from "@/styles/tables.module.scss";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ category: string; slug: string }>;
}

export async function generateStaticParams() {
  const params: { category: string; slug: string }[] = [];
  for (const category of MONSTER_CATEGORIES) {
    for (const monster of getMonsters(category)) {
      params.push({ category, slug: monster.slug });
    }
  }
  return params;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { category, slug } = await params;
  const monster = getMonster(category as MonsterCategory, slug);
  return {
    title: monster ? `${monster.name} — MHFU Blacksmith` : "Monster",
    description: monster?.description,
  };
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

export default async function MonsterDetailPage({ params }: Props) {
  const { category, slug } = await params;

  if (!MONSTER_CATEGORIES.includes(category as MonsterCategory)) notFound();

  const monster = getMonster(category as MonsterCategory, slug);
  if (!monster) notFound();

  const hitzoneEntries = monster.hitzones
    ? Object.entries(monster.hitzones)
    : [];

  return (
    <>
      <nav className="weapon-navigation">
        <div>
          <Link href={`/monsters/${category}/`}>
            <div className="icon icon--nav">
              <img src="/images/arrow.png" alt="Back" />
            </div>
          </Link>
        </div>
      </nav>
      <hr className="border" />

      <div className="weapon-details-page">
        {/* Monster list sidebar */}
        <Card variant="weapon-tree">
          <div className={`icon icon--large icon--monster icon--${category}`}>
            <img
              src={`/images/monsters/${slug}.png`}
              alt={monster.name}
              width={90}
              height={90}
            />
          </div>
        </Card>

        {/* Detail panel */}
        <Card className="weapon-card">
          <div className={`${cardStyles["weapon-card__header"]} ${cardStyles["weapon-card__header--monster"]}`}>
            <div className="details">
              <p>{monster.name}</p>
              {monster.habitats && (
                <p>
                  {monster.habitats.join(", ")}
                </p>
              )}
            </div>
            <div className={`icon icon--monster icon--${category}`}>
              <img
                src={`/images/monsters/${slug}.png`}
                alt={monster.name}
                width={90}
                height={90}
              />
            </div>
          </div>

          <div className={cardStyles["weapon-card__details"]}>
            {monster.description && (
              <p className="description">{monster.description}</p>
            )}

            <hr />

            {hitzoneEntries.length > 0 && (
              <table className={tableStyles["monster-hz"]}>
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
