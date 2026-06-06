import { notFound } from "next/navigation";
import { getDecorations, getDecoration, getDecorationTree } from "@/lib/decorations";
import WeaponTreeRow from "@/components/WeaponTreeRow";
import MaterialRow from "@/components/MaterialRow";
import Card from "@/components/Card";
import styles from "@/styles/weapon-tree.module.scss";
import cardStyles from "@/styles/weapon-card.module.scss";
import type { Metadata } from "next";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getDecorations().map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const deco = getDecoration(slug);
  return { title: deco ? `${deco.name} — MHFU Blacksmith` : "Decoration" };
}

export default async function DecorationDetailPage({ params }: Props) {
  const { slug } = await params;
  const deco = getDecoration(slug);
  if (!deco) notFound();

  const tree = getDecorationTree();

  return (
    <>
      <nav className="weapon-navigation">
        <div>
          <a href="/decorations/">
            <div className="icon icon--nav">
              <img src="/images/arrow.png" alt="Back" />
            </div>
          </a>
        </div>
      </nav>
      <hr className="border" />

      <div className="weapon-details-page">
        <Card variant="weapon-tree">
          <div className={styles["weapon-tree"]}>
            {tree.map.map((node) => (
              <ul key={node.slug}>
                <WeaponTreeRow
                  node={node}
                  sectionType="decoration"
                  basePath="/decorations/"
                />
              </ul>
            ))}
          </div>
        </Card>

        <Card className="weapon-card">
          <div className={cardStyles["weapon-card__header"]}>
            <div
              className={[
                "icon icon--large icon--decoration",
                deco.color ? `icon--${deco.color}` : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <img src="/images/decoration.png" alt={deco.name} />
            </div>
            <p>{deco.name}</p>
          </div>

          <div className={cardStyles["weapon-card__details"]}>
            <div className="stats">
              <div>
                <h3>Slots:</h3>
                <p>
                  <span id="weaponSlots">
                    {Array.from({ length: 3 }, (_, i) =>
                      i < (deco.slots ?? 0) ? "O" : "-"
                    ).join("")}
                  </span>
                </p>
              </div>
              {deco.category && (
                <div>
                  <h3>Category:</h3>
                  <p><span>{deco.category}</span></p>
                </div>
              )}
            </div>

            {deco.skills && deco.skills.length > 0 && (
              <>
                <hr />
                <div className="skills">
                  {deco.skills.map((skill, i) => (
                    <p key={i} className="element">{skill}</p>
                  ))}
                </div>
              </>
            )}

            {deco.create_mats && deco.create_mats.length > 0 && (
              <div className="requirements">
                <div className="create_mats">
                  <p>
                    <span>Create cost: </span>{deco.create_cost}z
                  </p>
                  {deco.create_mats.map((m, i) => (
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
