"use client";

import Link from "next/link";
import { useT } from "@/context/LanguageContext";

/** The "Blacksmith" title image at the top of a page, linking home. */
export default function SiteTitle() {
  return (
    <Link className="blacksmith__title" href="/">
      <img src="/images/blacksmith.png" alt={useT().site.logoAlt} />
    </Link>
  );
}
