import { DetailCard } from "@/components/DetailPanel";

/**
 * /monsters/<type>/: the type's monsters are listed down the left by the
 * monsters layout (MonsterShell); with none selected, the detail card is empty.
 * Phones show only the list here.
 */
export default function MonsterListClient() {
  return (
    <DetailCard className="mobile:hidden">
      <p className="text-main leading-[1.25] uppercase">No data</p>
    </DetailCard>
  );
}
