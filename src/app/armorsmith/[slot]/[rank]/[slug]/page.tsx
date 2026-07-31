import Link from "next/link";
import { notFound } from "next/navigation";
import { getArmorParams, getArmorPiece, getArmorTree } from "@/lib/armor";
import { getArmorPieces } from "@/lib/armor";
import { ARMOR_SLOTS, ARMOR_RANKS, type ArmorSlot, type ArmorRank } from "@/lib/constants";
import WeaponTreeRow from "@/components/WeaponTreeRow";
import MaterialRow from "@/components/MaterialRow";
import Card from "@/components/Card";
import Icon from "@/components/Icon";
import cardStyles from "@/styles/weapon-card.module.scss";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ slot: string; rank: string; slug: string }>;
}

export async function generateStaticParams() {
  const params: { slot: string; rank: string; slug: string }[] = [];
  for (const { slot, rank } of getArmorParams()) {
    for (const piece of getArmorPieces(slot, rank)) {
      params.push({ slot, rank, slug: piece.slug });
    }
  }
  return params;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slot, rank, slug } = await params;
  const piece = getArmorPiece(slot as ArmorSlot, rank as ArmorRank, slug);
  return { title: piece ? `${piece.name} — MHFU Blacksmith` : "Armor" };
}

export default async function ArmorDetailPage({ params }: Props) {
  const { slot, rank, slug } = await params;

  if (!ARMOR_SLOTS.includes(slot as ArmorSlot) || !ARMOR_RANKS.includes(rank as ArmorRank)) {
    notFound();
  }

  const piece = getArmorPiece(slot as ArmorSlot, rank as ArmorRank, slug);
  if (!piece) notFound();

  const tree = getArmorTree(slot as ArmorSlot, rank as ArmorRank);
  const basePath = `/armorsmith/${slot}/${rank}/`;

  return (
    <>
      <nav className="weapon-navigation">
        <div>
          <Link href="/armorsmith/" aria-label="Back">
            <Icon type="arrow" nav alt="Back" />
          </Link>
        </div>
      </nav>
      <hr className="border" />

      <div className="weapon-details-page">
        {tree && (
          <Card variant="weapon-tree">
            <div className="weapon-tree">
              {tree.map.map((node) => (
                <ul key={node.slug}>
                  <WeaponTreeRow node={node} sectionType={slot} basePath={basePath} />
                </ul>
              ))}
            </div>
          </Card>
        )}

        <Card className={cardStyles["weapon-card"]}>
          <div className={cardStyles["weapon-card__header"]}>
            <Icon type={slot} size="large" alt={piece.name} />
            <p>{piece.name}</p>
            {piece.sex && <span className="sex">{piece.sex}</span>}
            {piece.hunter_type && <span className="hunter_type">{piece.hunter_type}</span>}
          </div>

          <div className={cardStyles["weapon-card__details"]}>
            <div className="stats stats--armor">
              <div>
                <h3>Defence:</h3>
                <p><span>{piece.defence}</span></p>
              </div>
              <div>
                <h3>Slots:</h3>
                <p>
                  <span id="weaponSlots">
                    {Array.from({ length: 3 }, (_, i) =>
                      i < (piece.slots ?? 0) ? "O" : "-"
                    ).join("")}
                  </span>
                </p>
              </div>
              {piece.fire_res !== undefined && (
                <div>
                  <h3>Fire res:</h3>
                  <p><span>{piece.fire_res}</span></p>
                </div>
              )}
              {piece.water_res !== undefined && (
                <div>
                  <h3>Water res:</h3>
                  <p><span>{piece.water_res}</span></p>
                </div>
              )}
              {piece.thunder_res !== undefined && (
                <div>
                  <h3>Thunder res:</h3>
                  <p><span>{piece.thunder_res}</span></p>
                </div>
              )}
              {piece.ice_res !== undefined && (
                <div>
                  <h3>Ice res:</h3>
                  <p><span>{piece.ice_res}</span></p>
                </div>
              )}
              {piece.dragon_res !== undefined && (
                <div>
                  <h3>Dragon res:</h3>
                  <p><span>{piece.dragon_res}</span></p>
                </div>
              )}
            </div>

            <hr />

            {piece.skills && piece.skills.length > 0 && (
              <div className="skills">
                <h2>Skills</h2>
                {piece.skills.map((skill, i) => (
                  <div key={i}>
                    <h3>{skill.name}</h3>
                    <p className={Number(skill.amount) < 0 ? "negative" : "positive"}>
                      {skill.amount}
                    </p>
                  </div>
                ))}
              </div>
            )}

            {piece.create_mats && piece.create_mats.length > 0 && (
              <div className="requirements">
                <div className="create_mats">
                  <p>
                    <span>Create cost: </span>{piece.create_cost}z
                  </p>
                  {piece.create_mats.map((m, i) => (
                    <MaterialRow key={i} material={m} />
                  ))}
                </div>
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
