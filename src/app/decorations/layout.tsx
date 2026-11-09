import DecorationRouteShell from "./DecorationShell";

/** Keeps the decorations nav and tree mounted across decoration pages. */
export default function DecorationsLayout({ children }: { children: React.ReactNode }) {
  return <DecorationRouteShell>{children}</DecorationRouteShell>;
}
