import ArmorRouteShell from "./ArmorShell";

/** Keeps the armor nav and tree mounted across armor pages. */
export default function ArmorsmithLayout({ children }: { children: React.ReactNode }) {
  return <ArmorRouteShell>{children}</ArmorRouteShell>;
}
