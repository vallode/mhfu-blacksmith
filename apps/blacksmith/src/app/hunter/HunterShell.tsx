"use client";

import { useMemo } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Card from "@/components/Card";
import CardBox from "@/components/CardBox";
import Icon from "@/components/Icon";
import { SELECTOR_BAR_HEIGHT, barText } from "@/components/SelectorBar";
import SplitPage from "@/components/SplitPage";
import { useLocale } from "@/context/LanguageContext";
import { useSave } from "@/context/SaveContext";
import { cn } from "@/lib/cn";
import { awardTotals } from "@/lib/awards";
import { useQuests } from "@/lib/client-data";
import {
  HUNTER_PAGES,
  SAVE_PAGE,
  formatPlayTime,
  hunterPageFromPath,
  hunterPageHref,
  questProgress,
  type HunterPage,
  type HunterPageId,
} from "@/lib/hunter-pages";
import { loggedMonsterCount } from "@/lib/monster-log";
import { useAwardContext } from "./useAwardContext";

const activeRow = "bg-(image:--gradient-hover-glow)";
// /hunter/ shows a page (the Guild Card, or the save file without a hunter)
// beside the list on wider screens; phones show the list alone there.
const defaultRow = "compact:bg-(image:--gradient-hover-glow) wide:bg-(image:--gradient-hover-glow)";

/**
 * The loaded hunter across the top of the list card, a flat grey bar like the
 * tree cards' filter: name on the left, then HR, play time and zenny.
 */
function HunterHeader() {
  const { t, formatNumber } = useLocale();
  const text = t.site.hunter;
  const { save } = useSave();
  const meta =
    save &&
    [
      save.hunterRank !== undefined && text.rankShort(save.hunterRank),
      save.playTime !== undefined && formatPlayTime(save.playTime),
      save.zenny !== undefined && `${formatNumber(save.zenny)}z`,
    ].filter(Boolean);
  // The stats follow the name, and drop to a second line when the card is
  // too narrow for both.
  return (
    <div
      className="absolute top-[4px] right-[4px] left-[4px] z-2 flex flex-wrap content-center items-baseline gap-x-[1.6rem] gap-y-[0.4rem] overflow-hidden bg-selector px-[1.6rem]"
      style={{ height: SELECTOR_BAR_HEIGHT }}
    >
      {save ? (
        <>
          <p className={cn(barText, "max-w-full truncate text-white")}>{save.name}</p>
          {meta && meta.length > 0 && (
            <p className={cn(barText, "max-w-full truncate text-small text-stat")}>
              {meta.join(" · ")}
            </p>
          )}
        </>
      ) : (
        <p className={cn(barText, "max-w-full truncate text-white/70")}>{text.noHunter}</p>
      )}
    </div>
  );
}

/** One page's row in the list: icon, name, and its count with a hunter loaded. */
function PageRow({
  page,
  current,
  isDefault,
  count,
}: {
  page: HunterPage;
  current: boolean;
  isDefault: boolean;
  count?: string;
}) {
  const text = useLocale().t.site.hunter;
  const label = text.pages[page.id === "guild-card" ? "guildCard" : page.id];
  if (!page.ready) {
    return (
      <div className="list-row pointer-events-none text-unavailable" aria-disabled="true">
        <Icon type={page.icon} nav className="opacity-50" />
        <p className="truncate">{label}</p>
        <span className="ml-auto pl-4 text-small">{text.soon}</span>
      </div>
    );
  }
  return (
    <Link
      href={hunterPageHref(page.id)}
      aria-current={current ? "page" : undefined}
      className={cn("list-row group", current ? activeRow : isDefault && defaultRow)}
    >
      <Icon type={page.icon} nav active={current} className="group-hover:before:bg-white" />
      <p className="truncate">{label}</p>
      {count && <span className="ml-auto pl-4 text-muted tabular-nums">{count}</span>}
    </Link>
  );
}

/** The hunter's pages down the left, then the save file under a divider. */
function HunterList({ page }: { page: HunterPageId | null }) {
  const { t, formatNumber } = useLocale();
  const { save } = useSave();
  const { quests } = useQuests();
  const progress = useMemo(
    () => (quests && save?.clearedQuests ? questProgress(quests, save) : null),
    [quests, save],
  );
  const awardCtx = useAwardContext();
  const awards = useMemo(() => (save ? awardTotals(awardCtx) : null), [save, awardCtx]);
  const monsters = loggedMonsterCount(save?.monsters);
  const counts: Partial<Record<HunterPageId, string>> = {
    awards: awards ? t.site.hunter.awards.earned(awards.earned, awards.tracked) : undefined,
    quests: progress
      ? t.site.hunter.guildCard.of(formatNumber(progress.done), formatNumber(progress.total))
      : undefined,
    monsters: monsters ? formatNumber(monsters) : undefined,
  };
  // The page /hunter/ shows beside the list on wider screens.
  const fallback: HunterPageId = save ? "guild-card" : "save";

  return (
    <CardBox>
      <Card variant="weapon-tree">
        {/* Room for the header over the top of the card. */}
        <div className="flex-none" style={{ height: SELECTOR_BAR_HEIGHT }} aria-hidden="true" />
        <nav aria-label={t.site.hunter.pagesLabel} className="flex flex-col pl-[13px]">
          {HUNTER_PAGES.map((p) => (
            <PageRow
              key={p.id}
              page={p}
              current={p.id === page}
              isDefault={!page && p.id === fallback}
              count={save ? counts[p.id] : undefined}
            />
          ))}
          <hr className="my-[1rem] mr-[13px] h-[3px] w-auto" />
          <PageRow
            page={SAVE_PAGE}
            current={page === "save"}
            isDefault={!page && fallback === "save"}
          />
        </nav>
      </Card>
      <HunterHeader />
    </CardBox>
  );
}

/**
 * The hunter section's frame: the loaded hunter atop their pages down the
 * left and the open page on the right, like the bestiary. On phones
 * the list fills the screen and a page slides up over it (SplitPage). Lives
 * in the hunter layout so the list stays mounted between pages.
 */
export default function HunterShell({ children }: { children: React.ReactNode }) {
  const t = useLocale().t;
  const page = hunterPageFromPath(usePathname());
  return (
    <>
      <h1 className="sr-only">{t.site.nav.hunter}</h1>
      <SplitPage list={<HunterList page={page} />} closeHref={page ? "/hunter/" : undefined}>
        {children}
      </SplitPage>
    </>
  );
}
