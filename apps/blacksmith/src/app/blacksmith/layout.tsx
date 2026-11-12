import WeaponRouteShell from "./WeaponShell";

/** Keeps the weapon page bar and tree mounted across weapon pages. */
export default function BlacksmithLayout({ children }: { children: React.ReactNode }) {
  return <WeaponRouteShell>{children}</WeaponRouteShell>;
}
