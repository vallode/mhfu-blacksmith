import { notFound } from "next/navigation";
import GameShell from "@/components/GameShell";
import { isLang, isSiteGame, SITE_GAMES } from "@/lib/site";

interface Props {
  children: React.ReactNode;
  params: Promise<{ lang: string; game: string }>;
}

/** One copy of the site per game with data, in each language. */
export function generateStaticParams() {
  return SITE_GAMES.map((game) => ({ game }));
}

export default async function GameLayout({ children, params }: Props) {
  const { lang, game } = await params;
  if (!isLang(lang) || !isSiteGame(game)) notFound();
  return <GameShell site={{ lang, game }}>{children}</GameShell>;
}
