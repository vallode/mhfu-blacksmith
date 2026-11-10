import { NoDataCard } from "@/components/DetailPanel";

/**
 * /decorations/: the tree is down the left in the decorations layout
 * (DecorationShell); with no decoration selected, the detail card is empty.
 */
export default function DecorationsListClient() {
  return <NoDataCard />;
}
