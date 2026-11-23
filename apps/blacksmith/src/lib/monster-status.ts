/**
 * Monster status tolerances (`Monster.tolerances`, from the disc): their
 * compact form in the site's bundles, and the figures the monster page and
 * its link-preview card show. Language-free: the page and card word them.
 */
import type { MonsterTolerances, PoisonTolerance, StatusTolerance } from "./types";

/** The statuses in the order the page and card list them: the weapon statuses, then KO. */
export const STATUS_ORDER = ["poison", "paralysis", "sleep", "ko"] as const;
export type MonsterStatus = (typeof STATUS_ORDER)[number];

/** The game counts status times in frames, at 30 a second. */
const TICKS_PER_SECOND = 30;

/** Frames in seconds, to one decimal where it isn't whole. */
export const ticksToSeconds = (ticks: number) => Math.round((ticks / TICKS_PER_SECOND) * 10) / 10;

/** How long the status lasts once it triggers, in frames (poison: its whole run). */
export function statusDuration(t: StatusTolerance | PoisonTolerance): number {
  return "total_time" in t ? t.total_time : t.duration;
}

type StatusTuple = [number, number, number, number, number];
type PoisonTuple = [number, number, number, number, number, number, number];
/** tolerances: [paralysis, sleep, ko, poison], each null when the monster is immune. */
export type CompactTolerances = [
  StatusTuple | null,
  StatusTuple | null,
  StatusTuple | null,
  PoisonTuple | null,
];

const statusTuple = (s: StatusTolerance | null): StatusTuple | null =>
  s && [s.initial, s.increase, s.recovery, s.recovery_time, s.duration];
const fromStatusTuple = (s: StatusTuple | null): StatusTolerance | null =>
  s && {
    initial: s[0],
    increase: s[1],
    recovery: s[2],
    recovery_time: s[3],
    duration: s[4],
  };

export function encodeTolerances(t: MonsterTolerances): CompactTolerances {
  const p = t.poison;
  return [
    statusTuple(t.paralysis),
    statusTuple(t.sleep),
    statusTuple(t.ko),
    p && [
      p.initial,
      p.increase,
      p.recovery,
      p.recovery_time,
      p.damage,
      p.damage_interval,
      p.total_time,
    ],
  ];
}

export function decodeTolerances([paralysis, sleep, ko, p]: CompactTolerances): MonsterTolerances {
  return {
    paralysis: fromStatusTuple(paralysis),
    sleep: fromStatusTuple(sleep),
    ko: fromStatusTuple(ko),
    poison: p && {
      initial: p[0],
      increase: p[1],
      recovery: p[2],
      recovery_time: p[3],
      damage: p[4],
      damage_interval: p[5],
      total_time: p[6],
    },
  };
}
