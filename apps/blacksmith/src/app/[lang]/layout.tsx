import type { Metadata, Viewport } from "next";
import { notFound } from "next/navigation";
import "../globals.css";
import { rootMetadata } from "@/lib/root-metadata";
import { THEME_COLOR } from "@/lib/seo";
import { isLang, LANGS } from "@/lib/site";
import RootDocument from "@/components/RootDocument";

interface Props {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}

/** The root layout, one per language: `<html lang>` comes from the route. */
export function generateStaticParams() {
  return LANGS.map((lang) => ({ lang }));
}

export async function generateMetadata({ params }: Omit<Props, "children">): Promise<Metadata> {
  const { lang } = await params;
  return rootMetadata(isLang(lang) ? lang : "en");
}

export const viewport: Viewport = { themeColor: THEME_COLOR };

export default async function RootLayout({ children, params }: Props) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  return <RootDocument lang={lang}>{children}</RootDocument>;
}
