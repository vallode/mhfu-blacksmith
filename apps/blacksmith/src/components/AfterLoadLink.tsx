"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { usePageLoaded } from "@/hooks/useAfterLoad";

type Props = Omit<React.ComponentProps<typeof Link>, "href" | "prefetch"> & { href: string };

/**
 * A Link that prefetches its page when it comes into view only once this
 * page has loaded (usePageLoaded). A route's prefetch inserts that route's JS
 * chunks as scripts, and scripts added before `load` hold it back: on a slow
 * connection, the sidebar's links to every other section (only on screen at
 * desktop widths) kept a weapon page from loading a second longer on desktop
 * than on a phone. Hovering or touching it still prefetches at once.
 *
 * Next remounts the link when its prefetch turns on, which resets
 * useLinkStatus for a navigation started from it before `load`.
 */
export default function AfterLoadLink({ href, onMouseEnter, onTouchStart, ...props }: Props) {
  const loaded = usePageLoaded();
  const router = useRouter();
  // Next skips its own hover and touch prefetch while `prefetch` is false.
  const intent = () => {
    if (!loaded) router.prefetch(href);
  };
  return (
    <Link
      {...props}
      href={href}
      prefetch={loaded ? undefined : false}
      onMouseEnter={(event: React.MouseEvent<HTMLAnchorElement>) => {
        onMouseEnter?.(event);
        intent();
      }}
      onTouchStart={(event: React.TouchEvent<HTMLAnchorElement>) => {
        onTouchStart?.(event);
        intent();
      }}
    />
  );
}
