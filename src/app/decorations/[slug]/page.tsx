import { notFound } from "next/navigation";
import { getDecorations, getDecoration } from "@/lib/decorations";
import type { Metadata } from "next";
import DecorationDetailClient from "./DecorationDetailClient";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getDecorations().map((d) => ({ slug: d.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const deco = getDecoration(slug);
  return { title: deco ? `${deco.name} — MHFU Blacksmith` : "Decoration" };
}

export default async function DecorationDetailPage({ params }: Props) {
  const { slug } = await params;
  if (!getDecoration(slug)) notFound();

  return <DecorationDetailClient slug={slug} />;
}
