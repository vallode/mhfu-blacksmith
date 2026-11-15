import { NoDataCard } from "@/components/DetailPanel";

/**
 * /items/: the item list is down the left in the items layout (ItemShell);
 * with no item selected, the detail card is empty.
 */
export default function ItemsListClient() {
  return (
    <NoDataCard>
      <p className="whitespace-normal text-white">
        Pick an item to see the monsters and quests it comes from.
      </p>
    </NoDataCard>
  );
}
