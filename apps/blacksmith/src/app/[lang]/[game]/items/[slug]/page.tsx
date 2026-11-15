import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getItemSummaries, getItemSummary } from "@/lib/items-data";
import { itemDescription, pageMetadata } from "@/lib/seo";
import { pathsOf, type PageProps } from "@/lib/site-params";
import ItemDetailClient from "./ItemDetailClient";

type Props = PageProps<{ slug: string }>;

export async function generateStaticParams() {
  return getItemSummaries().map((i) => ({ slug: i.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug, ...site } = await params;
  const item = getItemSummary(slug);
  if (!item) return {};
  return pageMetadata({
    title: item.name,
    description: itemDescription(item.name),
    path: pathsOf(site).items(slug),
  });
}

export default async function ItemDetailPage({ params }: Props) {
  const { slug } = await params;
  if (!getItemSummary(slug)) notFound();
  return <ItemDetailClient slug={slug} />;
}
