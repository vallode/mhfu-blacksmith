import { DetailCard } from "@/components/DetailPanel";
import Msg from "@/components/Msg";

/**
 * /monsters/<type>/: the type's monsters are listed down the left by the
 * monsters layout (MonsterShell); with none selected, the detail card is empty.
 */
export default function MonsterListClient() {
  return (
    <DetailCard>
      <p className="text-main leading-[1.25] uppercase">
        <Msg k="monsters.noData" />
      </p>
    </DetailCard>
  );
}
