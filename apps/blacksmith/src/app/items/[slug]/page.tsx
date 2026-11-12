import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getItemSummaries, getItemSummary } from "@/lib/items-data";
import { itemDescription, pageMetadata } from "@/lib/seo";
import ItemDetailClient from "./ItemDetailClient";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return getItemSummaries().map((i) => ({ slug: i.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const item = getItemSummary(slug);
  if (!item) return {};
  return pageMetadata({
    title: item.name,
    description: itemDescription(item.name),
    path: `/items/${slug}/`,
  });
}

export default async function ItemDetailPage({ params }: Props) {
  const { slug } = await params;
  if (!getItemSummary(slug)) notFound();
  return <ItemDetailClient slug={slug} />;
}
