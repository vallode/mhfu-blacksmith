/** What a mod or shuffle did to the disc: the run log's line and the spoiler log's section. */

/** One changed slot, for the spoiler log. */
export interface ReportLine {
  /** Heading the line is listed under, e.g. a quest or a monster. */
  where: string;
  /** What changed, e.g. "Rathian Scale x1 (was Pin Tuna x2)". */
  text: string;
}

export interface Report {
  title: string;
  /** Short notes on what was and wasn't changed. */
  notes: string[];
  lines: ReportLine[];
  /** The run log's line for it, when a slot count doesn't fit. */
  summary?: string;
}

/** A report's line in the run log: its summary, or how many slots it changed. */
export function reportLogLine(report: Report): string {
  return report.summary ?? `${report.title}: ${report.lines.length} slots`;
}

/** A report for a feature that couldn't go in, and why. */
export function notApplied(title: string, why: string): Report {
  return {
    title,
    notes: [`${title} isn't in this image: ${why}.`],
    lines: [],
    summary: `${title}: not applied (${why})`,
  };
}
