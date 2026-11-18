import HunterShell from "./HunterShell";

/** Keeps the hunter's page list mounted across the hunter pages. */
export default function HunterLayout({ children }: { children: React.ReactNode }) {
  return <HunterShell>{children}</HunterShell>;
}
