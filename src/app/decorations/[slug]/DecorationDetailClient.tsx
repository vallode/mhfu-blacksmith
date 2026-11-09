"use client";

import Card from "@/components/Card";
import Icon from "@/components/Icon";
import {
  DetailBody,
  DetailCard,
  DetailHeader,
  DetailName,
  DetailRule,
  MaterialList,
  Requirements,
  Slots,
  Stat,
  StatList,
  StatValue,
} from "@/components/DetailPanel";
import { cn } from "@/lib/cn";
import { useDecoration } from "@/lib/client-data";
import Loading from "@/components/Loading";

interface Props {
  slug: string;
}

export default function DecorationDetailClient({ slug }: Props) {
  const { item: deco, loading } = useDecoration(slug);

  // The nav and the tree on the left come from the decorations layout
  // (DecorationShell), which stays mounted; this is only the detail panel.
  if (loading || !deco) {
    return <Card>{loading ? <Loading>Loading…</Loading> : <p>Not found.</p>}</Card>;
  }

  return (
    <DetailCard>
      <DetailHeader>
        <Icon type="decoration" size="large" color={deco.color} alt={deco.name} />
        <DetailName>{deco.name}</DetailName>
      </DetailHeader>

      <DetailBody>
        <StatList>
          <Stat label="Slots:">
            <Slots count={deco.slots} />
          </Stat>
          {deco.category && (
            <Stat label="Category:">
              <StatValue>{deco.category}</StatValue>
            </Stat>
          )}
        </StatList>

        {deco.skills && deco.skills.length > 0 && (
          <>
            <DetailRule />
            <div className="flex flex-1 flex-col gap-[13px]">
              {deco.skills.map((skill, i) => (
                <p key={i} className={cn("whitespace-normal", i === 0 && "w-full font-normal")}>
                  {skill}
                </p>
              ))}
            </div>
          </>
        )}

        {deco.create_mats && deco.create_mats.length > 0 && (
          <Requirements>
            <MaterialList
              label="Create cost"
              cost={deco.create_cost}
              materials={deco.create_mats}
            />
          </Requirements>
        )}
      </DetailBody>
    </DetailCard>
  );
}
