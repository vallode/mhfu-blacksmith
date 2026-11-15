import MonsterRouteShell from "./MonsterShell";

/** Keeps the bestiary nav and monster list mounted across monster pages. */
export default function MonstersLayout({ children }: { children: React.ReactNode }) {
  return <MonsterRouteShell>{children}</MonsterRouteShell>;
}
