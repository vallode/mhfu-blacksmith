/**
 * The RandomFU Bestiary: the bookshelf's "Practical Hunting" monster
 * articles (Fallen Objects, Wyverns 1-3, Pelagus, Carapaceon, Tigrex, Elder
 * Dragon, Lao-Shan Lung, Akantor, Nargacuga, Yama Tsukami, Ukanlos)
 * rewritten as a page per large monster, rating its weaknesses, weak
 * spots, status resistance and health, and naming the earliest quests it's
 * in per rank, as the shuffles left them (`bookshelf.ts` writes and unlocks
 * the articles; what it drops is in the Almanac).
 */
import { OvlFile } from "mhfu-extract/src/container/ovl.js";
import {
  BASE_HP_OFFSET,
  HITZONE_POINTER_OFFSET,
  locateMonsterChunks,
  MONSTER_CHUNK_SIZE,
  readHitzoneRows,
  TOLERANCE_OFFSET,
  type HitzoneRow,
} from "mhfu-extract/src/monsters/hitzones.js";
import { MONSTER_OVERLAY } from "mhfu-extract/src/overlay/monsters.js";
import type { ParsedQuest } from "mhfu-extract/src/quests/parser.js";
import type { Edits } from "../edits.js";
import type { GameData } from "../game/load.js";
import type { Tier } from "../game/tiers.js";
import { monsterName } from "../names.js";
import {
  checkPage,
  fitLine,
  PAGE_LINES,
  introPage,
  letterTitle,
  spreadEvenly,
  type Article,
  type GuidePlan,
} from "./bookshelf.js";
import { compact, paint, STYLE } from "./style.js";
import { largeAppearances, tierShort } from "./sources.js";

export const BESTIARY_NAME = "RandomFU Bestiary";

/** The monster articles, in order: title string and page count. */
export const BESTIARY_ARTICLES_EU: readonly Article[] = [
  { title: 679, pages: 8 },
  { title: 688, pages: 12 },
  { title: 701, pages: 11 },
  { title: 713, pages: 8 },
  { title: 722, pages: 9 },
  { title: 732, pages: 7 },
  { title: 740, pages: 7 },
  { title: 748, pages: 8 },
  { title: 757, pages: 6 },
  { title: 764, pages: 7 },
  { title: 772, pages: 8 },
  { title: 781, pages: 8 },
  { title: 790, pages: 8 },
];

export interface GuideMonster {
  emId: number;
  name: string;
  hp: number;
  /** Elements that hurt at all, strongest first, at the part where they hurt most. */
  elements: { name: string; value: number }[];
  /** Body parts, softest first (cut + bash + shot). */
  parts: { name: string; cut: number; bash: number; shot: number }[];
  /** First dose needed; null if the monster is immune. */
  status: {
    poison: number | null;
    sleep: number | null;
    paralysis: number | null;
    ko: number | null;
  };
  /** The earliest star level per rank it's a large monster in a quest the player can take. */
  appears: Tier[];
}

const ELEMENTS = ["fire", "water", "ice", "thunder", "dragon"] as const;
/** Offsets from `TOLERANCE_OFFSET` of each status's first-dose value (`monster-stats.ts`). */
const STATUS_AT = { paralysis: 0, ko: 10, sleep: 20, poison: 40 } as const;

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** Each large monster's data as it is in `task` (the edited `game_task.ovl`), by name. */
export function readGuideMonsters(task: OvlFile, emIds: Iterable<number>): GuideMonster[] {
  const chunks = locateMonsterChunks(task);
  if (!chunks) throw new Error("game_task.ovl: the monster table wasn't found");
  const r = task.reader;
  const out: GuideMonster[] = [];
  for (const emId of new Set(emIds)) {
    const at = chunks.offset + emId * MONSTER_CHUNK_SIZE;
    const rows = normalHitzones(task, at);
    if (!rows) continue;
    const named = new Map<number, string[]>();
    const entry = MONSTER_OVERLAY.find((m) => m.id === emId);
    for (const [part, [table, row]] of Object.entries(entry?.hitzones ?? {})) {
      if (table === 0 && row < rows.length) named.set(row, [...(named.get(row) ?? []), part]);
    }
    const used = named.size > 0 ? [...named.keys()] : rows.map((_, i) => i);
    const label = (row: number) =>
      (named.get(row) ?? [`part ${row + 1}`]).map(cap).join("/").slice(0, 14);
    const tolerance = (off: number) => {
      const v = r.u16(at + TOLERANCE_OFFSET + off);
      return v === 0 || v === 0xffff ? null : v;
    };
    out.push({
      emId,
      name: monsterName(emId),
      hp: r.u16(at + BASE_HP_OFFSET),
      elements: ELEMENTS.map((e) => ({
        name: cap(e),
        value: Math.max(...used.map((row) => rows[row]!.values[e])),
      }))
        .filter((e) => e.value > 0)
        .sort((a, b) => b.value - a.value),
      parts: used
        .map((row) => ({ name: label(row), ...physical(rows[row]!) }))
        .sort((a, b) => b.cut + b.bash + b.shot - (a.cut + a.bash + a.shot)),
      status: {
        poison: tolerance(STATUS_AT.poison),
        sleep: tolerance(STATUS_AT.sleep),
        paralysis: tolerance(STATUS_AT.paralysis),
        ko: tolerance(STATUS_AT.ko),
      },
      appears: [],
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

const physical = (row: HitzoneRow) => ({
  cut: row.values.cut,
  bash: row.values.bash,
  shot: row.values.shot,
});

/** A monster's first hitzone table (its normal state), or null if it has none. */
function normalHitzones(task: OvlFile, chunk: number): HitzoneRow[] | null {
  const list = task.reader.u32(chunk + HITZONE_POINTER_OFFSET);
  if (!task.isOwnVaddr(list)) return null;
  const table = task.reader.u32(task.vaddrToOffset(list));
  if (!task.isOwnVaddr(table)) return null;
  return readHitzoneRows(task, task.vaddrToOffset(table));
}

/** Each monster's earliest tier per rank as a large monster (`largeAppearances`). */
export function addAppearances(
  monsters: readonly GuideMonster[],
  appearances: ReadonlyMap<number, Tier[]>,
): void {
  for (const m of monsters) m.appears = appearances.get(m.emId) ?? [];
}

/** Rating scales: the value a part or element needs for ★★★, ★★ and ★. */
const CUT_STARS = [45, 30, 20];
const ELEMENT_STARS = [25, 15, 10];
/** Health, by fifths of the monsters in the guide. */
const BUILDS = ["Frail", "Sturdy", "Tough", "Mighty", "Colossal"];
const STATUSES = [
  ["poison", "Poison"],
  ["sleep", "Sleep"],
  ["paralysis", "Para"],
  ["ko", "KO"],
] as const;

const stars = (n: number) => (n === 0 ? "-" : "★".repeat(n));
const rate = (value: number, scale: readonly number[]) => {
  const i = scale.findIndex((min) => value >= min);
  return i === -1 ? 0 : 3 - i;
};

/** Where a monster stands among the others in the guide: its health, and how easily status takes. */
export interface GuideScale {
  build(hp: number): string;
  /** ★★★ for the third that takes the status quickest, ★ for the slowest, 0 if immune. */
  status(kind: keyof GuideMonster["status"], dose: number | null): number;
}

export function guideScale(monsters: readonly GuideMonster[]): GuideScale {
  const sorted = (values: number[]) => values.sort((a, b) => a - b);
  const hps = sorted(monsters.map((m) => m.hp));
  const doses = Object.fromEntries(
    STATUSES.map(([kind]) => [
      kind,
      sorted(monsters.map((m) => m.status[kind]).filter((d): d is number => d !== null)),
    ]),
  ) as Record<keyof GuideMonster["status"], number[]>;
  /** Where `v` falls in `values`, from 0 (lowest) to 1 (highest); 0 when all are equal. */
  const share = (values: number[], v: number) =>
    values.length < 2 ? 0 : values.filter((x) => x < v).length / (values.length - 1);
  return {
    build: (hp) => BUILDS[Math.min(BUILDS.length - 1, Math.floor(share(hps, hp) * BUILDS.length))]!,
    status: (kind, dose) =>
      dose === null ? 0 : 3 - Math.min(2, Math.floor(share(doses[kind], dose) * 3)),
  };
}

/** The Bestiary's first page. */
export function bestiaryIntro(seed: string): string {
  const { element, status, rank } = STYLE;
  return compact(
    introPage(BESTIARY_NAME, seed, [
      "★★★ hurts it most, ★ a little, - barely.",
      `Weak to: ${["Fire", "Water", "Thunder", "Ice", "Dragon"].map((e) => paint(element[e]!, e)).join(" ")}`,
      "Parts: Cut, Blunt and Shot, softest first.",
      `${paint(status.poison, "Poison")} ${paint(status.sleep, "Sleep")} ${paint(status.paralysis, "Para")} ${paint(status.ko, "KO")}: ★★★ fastest, - immune`,
      `${paint(STYLE.note, "Frail")} to ${paint(STYLE.note, "Colossal")}: base HP next to the rest.`,
      `Quests: ${paint(rank.low, "LR★2")} ${paint(rank.high, "HR★6")} ${paint(rank.g, "G★1")}, the first per rank`,
    ]),
  );
}

/** One monster's page. */
export function monsterPage(m: GuideMonster, scale: GuideScale): string {
  const elements = m.elements
    .map((e) => ({ ...e, stars: rate(e.value, ELEMENT_STARS) }))
    .filter((e) => e.stars > 0)
    .map((e) => paint(STYLE.element[e.name] ?? STYLE.note, `${e.name}${stars(e.stars)}`));
  const status = STATUSES.map(([kind]) => scale.status(kind, m.status[kind]));
  const quests =
    m.appears.length === 0
      ? paint(STYLE.none, "In no Village or Guild quest")
      : `Quests: ${m.appears.map((tier) => paint(STYLE.rank[tier.band], tierShort(tier))).join(" ")}`;
  // Header, weaknesses, status and quests take four lines; parts get the rest.
  const parts = PAGE_LINES - 4;
  return compact(
    [
      `${paint(STYLE.name, m.name)}  ${paint(STYLE.note, scale.build(m.hp))}`,
      fitLine("Weak to: ", elements, paint(STYLE.none, "nothing much")),
      ...m.parts
        .slice(0, parts)
        .map(
          (p) =>
            `${p.name.slice(0, 12)}: Cut${stars(rate(p.cut, CUT_STARS))} Blunt${stars(rate(p.bash, CUT_STARS))} Shot${stars(rate(p.shot, CUT_STARS))}`,
        ),
      status.every((n) => n === 0)
        ? paint(STYLE.none, "Shrugs off poison, sleep, paralysis and KO")
        : STATUSES.map(([kind, label], i) =>
            paint(
              status[i] === 0 ? STYLE.none : STYLE.status[kind],
              `${label}${stars(status[i]!)}`,
            ),
          ).join(" "),
      quests,
    ].join("\n"),
  );
}

/** Each article's title and pages: the intro, the article's monsters a page each, then blank pages. */
export function bestiaryStrings(
  seed: string,
  monsters: readonly GuideMonster[],
  articles: readonly Article[],
): { texts: string[]; titles: string[]; listed: GuideMonster[][]; left: GuideMonster[] } {
  const scale = guideScale(monsters);
  const intro = bestiaryIntro(seed);
  checkPage(intro);
  const counts = spreadEvenly(
    monsters.length,
    articles.map((a, i) => Math.max(0, a.pages - (i === 0 ? 1 : 0))),
  );
  const texts: string[] = [];
  const titles: string[] = [];
  const listed: GuideMonster[][] = [];
  let next = 0;
  articles.forEach((article, i) => {
    const own = monsters.slice(next, next + counts[i]!);
    next += own.length;
    const pages = [...(i === 0 ? [intro] : []), ...own.map((m) => monsterPage(m, scale))];
    pages.forEach(checkPage);
    while (pages.length < article.pages) pages.push(" ");
    titles.push(
      letterTitle(
        BESTIARY_NAME,
        own.map((m) => m.name),
      ),
    );
    texts.push(titles.at(-1)!, ...pages);
    listed.push(own);
  });
  return { texts, titles, listed, left: monsters.slice(next) };
}

/**
 * The Bestiary for this seed, to write with `writeGuides`: its articles
 * and its text, which doesn't shrink (its size hardly changes by seed).
 */
export function planBestiary(
  game: GameData,
  quests: readonly ParsedQuest[],
  seed: string,
  edits: Edits,
): GuidePlan {
  const title = "Bookshelf monster guide";
  const articles = BESTIARY_ARTICLES_EU;
  const large = quests.flatMap((q) => q.largeMonsters.map((m) => m.monsterId));
  const task = new OvlFile(edits.dataFileNow(game.gameTask.index));
  const monsters = readGuideMonsters(task, large);
  addAppearances(monsters, largeAppearances(quests));
  return {
    title,
    articles,
    fit() {
      const { texts, titles, listed, left } = bestiaryStrings(seed, monsters, articles);
      const notes = [
        `Home > Open Bookshelf > Info Magazine: the Practical Hunting monster articles (Fallen Objects, About Wyverns 1-3, the Pelagus, Carapaceon and Elder Dragon info, and the Tigrex, Lao-Shan Lung, Akantor, Nargacuga, Yama Tsukami and Ukanlos pages) are now the ${BESTIARY_NAME}, one page per large monster rated in stars, with the earliest quests it's in per rank, readable from the start. In English in every language.`,
      ];
      if (left.length > 0) {
        notes.push(`No room for ${left.length} monsters: ${left.map((m) => m.name).join(", ")}.`);
      }
      return {
        texts,
        report: {
          title,
          notes,
          lines: listed.map((ms, i) => ({
            where: titles[i]!,
            text: ms.length > 0 ? ms.map((m) => m.name).join(", ") : "(blank)",
          })),
        },
      };
    },
  };
}
