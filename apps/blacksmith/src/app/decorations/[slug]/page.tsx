import { notFound } from "next/navigation";
import { getDecorations, getDecoration } from "@/lib/decorations";
import type { Metadata, Viewport } from "next";
import { accentViewport, decorationDescription, embedIcon, pageMetadata, tintFor } from "@/lib/seo";
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
  if (!deco) return {};
  return pageMetadata({
    title: deco.name,
    description: decorationDescription(deco),
    path: `/decorations/${slug}/`,
    image: embedIcon("decoration", deco.rarity, deco.color),
    oembed: true,
  });
}

export async function generateViewport({ params }: Props): Promise<Viewport> {
  const { slug } = await params;
  const deco = getDecoration(slug);
  return accentViewport(tintFor(deco?.rarity, deco?.color));
}

export default async function DecorationDetailPage({ params }: Props) {
  const { slug } = await params;
  if (!getDecoration(slug)) notFound();

  return <DecorationDetailClient slug={slug} />;
}
