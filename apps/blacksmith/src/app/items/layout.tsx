import ItemRouteShell from "./ItemShell";

/** Keeps the item list mounted across item pages. */
export default function ItemsLayout({ children }: { children: React.ReactNode }) {
  return <ItemRouteShell>{children}</ItemRouteShell>;
}
