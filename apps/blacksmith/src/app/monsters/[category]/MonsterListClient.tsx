import { NoDataCard } from "@/components/DetailPanel";

/**
 * /monsters/<type>/: the type's monsters are listed down the left by the
 * monsters layout (MonsterShell); with none selected, the detail card is empty.
 */
export default function MonsterListClient() {
  return <NoDataCard />;
}
