import { NoDataCard } from "@/components/DetailPanel";
import Msg from "@/components/Msg";

/**
 * /items/: the item list is down the left in the items layout (ItemShell);
 * with no item selected, the detail card is empty.
 */
export default function ItemsListClient() {
  return (
    <NoDataCard>
      <p className="whitespace-normal text-white">
        <Msg k="items.list.pickItem" />
      </p>
    </NoDataCard>
  );
}
