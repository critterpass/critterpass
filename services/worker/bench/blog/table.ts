/** One benchmarked draft, and the markdown table a destination's drafts print as. */
import type { Verdict } from './judge';
import type { DraftMetrics } from './score';

export interface DraftResult {
  readonly destination: string;
  readonly crew: string;
  /** Places the draft was planned from, stops the draft holds, and how many matched a blog place. */
  readonly places: number;
  readonly stops: number;
  readonly matched: number;
  readonly metrics: DraftMetrics;
  /** The judge's overall verdict, 0..1. */
  readonly judge: number | null;
  readonly verdict: Verdict | null;
  /** 0..100. */
  readonly score: number;
  /** Each drafted day: its stops (meals marked `*`, each with its area) and its shape. */
  readonly days: readonly {
    day: number;
    theme: string;
    stops: readonly string[];
    areas: number;
    km: number;
    backtracks: number;
  }[];
}

const pct = (value: number | null) => (value === null ? '–' : String(Math.round(value * 100)));

export function destinationTable(slug: string, results: readonly DraftResult[]): string {
  const header =
    '| crew | coverage | coherence | time fit | meals | diversity | personal | judge | prefer | matched | score |\n' +
    '|---|---|---|---|---|---|---|---|---|---|---|';
  const rows = results.map(
    (r) =>
      `| ${r.crew} | ${pct(r.metrics.coverage)} | ${pct(r.metrics.coherence)} | ${pct(r.metrics.timeFit)} | ${pct(r.metrics.meals)} | ${pct(r.metrics.diversity)} | ${pct(r.metrics.personalFit)} | ${pct(r.judge)} | ${r.verdict?.prefer ?? '–'} | ${r.matched}/${r.stops} | ${r.score.toFixed(1)} |`,
  );
  const mean =
    results.length === 0 ? 0 : results.reduce((sum, r) => sum + r.score, 0) / results.length;
  return `\n### ${slug}: ${mean.toFixed(1)}\n\n${header}\n${rows.join('\n')}`;
}
