/**
 * What makes a UI sweep red. The sweep exists to produce screenshots and run the screen checks on
 * them, so a step that fails costs screenshots, not the run:
 *
 * - red: a screen-check finding, a `[ui-qa]` line, a lab that would not open (a failed `lab-*`
 *   flow: its scenes cannot fail it), or more than MISSING_LIMIT of the planned screenshots missing;
 * - not red: a failed `seed-*` flow or a scene that never drew. Their screenshots are listed as
 *   "not captured" with the screen the device showed instead.
 *
 * ./run-shard applies the per-flow part to its exit code; ./run-summary counts the screenshots of
 * every shard against the manifest (./sweep-manifest) and reports the verdict.
 */
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

import { sweepFlows, SWEEP_DIR, type SweepFlow } from './sweep-manifest';

/** The share of planned screenshots a sweep may miss and stay green. */
export const MISSING_LIMIT = 0.05;
/** `lab-scene.yaml` saves the screen under this prefix when a scene's row cannot be found. */
export const NOT_CAPTURED_PREFIX = 'not-captured-';

/** The screen a scene left in place of its screenshot. */
export function isNotCaptured(name: string): boolean {
  return name.startsWith(NOT_CAPTURED_PREFIX);
}

const norm = (flow: string) => flow.replace(/\\/g, '/').replace(/\.ya?ml$/, '');
const isSeed = (flow: string) => norm(flow).startsWith(`${SWEEP_DIR}/seed-`);
const isLab = (flow: string) => norm(flow).startsWith(`${SWEEP_DIR}/lab-`);

/** Failed flows that fail their shard, and the sweep's seed flows, which only cost screenshots. */
export function shardFailures(failed: readonly string[]): { red: string[]; tolerated: string[] } {
  return {
    red: failed.filter((flow) => !isSeed(flow)),
    tolerated: failed.filter(isSeed),
  };
}

export interface MissingShot {
  readonly shot: string;
  readonly flow: string;
  readonly shard: string;
  /** The screen saved instead, inside the shard's artifact, when there is one. */
  readonly failureScreen?: string;
}

export interface SweepResult {
  readonly planned: number;
  readonly missing: MissingShot[];
  readonly labsNotOpened: string[];
}

export interface SweepShard {
  /** `android-shard-2` */
  readonly shard: string;
  /** Planned flows, without extension. */
  readonly planned: readonly string[];
  readonly failedFlows: readonly string[];
  /** Names (without `.png`) in the shard's `screenshots/`. */
  readonly screenshots: readonly string[];
  /** File names in the shard's `failures/`. */
  readonly failures: readonly string[];
}

/** The files of one downloaded shard artifact the sweep's count needs. */
export function readSweepFiles(dir: string): Pick<SweepShard, 'screenshots' | 'failures'> {
  const names = (sub: string) =>
    existsSync(path.join(dir, sub)) ? readdirSync(path.join(dir, sub)) : [];
  return {
    screenshots: names('screenshots')
      .filter((file) => file.endsWith('.png'))
      .map((file) => file.slice(0, -4)),
    failures: names('failures'),
  };
}

/** The sweep's count over every shard, or undefined when the run planned no sweep flow. */
export function sweepResult(
  shards: readonly SweepShard[],
  flows: readonly SweepFlow[] = sweepFlows(),
): SweepResult | undefined {
  const byFlow = new Map(flows.map((flow) => [flow.flow, flow]));
  const missing: MissingShot[] = [];
  const labsNotOpened: string[] = [];
  let planned = 0;
  let any = false;
  for (const shard of shards) {
    // A screenshot counts wherever its platform captured it: a retried flow can land elsewhere.
    const platform = shard.shard.split('-')[0] ?? '';
    const captured = new Set(
      shards.filter((s) => s.shard.startsWith(`${platform}-`)).flatMap((s) => s.screenshots),
    );
    for (const name of shard.planned.map(norm)) {
      const flow = byFlow.get(name);
      if (!flow) continue;
      any = true;
      planned += flow.shots.length;
      const failed = shard.failedFlows.map(norm).includes(name);
      if (failed && isLab(name)) labsNotOpened.push(`${name} (${shard.shard})`);
      const slug = `${name.replace(/\//g, '__')}.png`;
      for (const shot of flow.shots) {
        if (captured.has(shot)) continue;
        const screen = [`${NOT_CAPTURED_PREFIX}${shot}.png`, slug].find((file) =>
          shard.failures.includes(file),
        );
        missing.push({
          shot,
          flow: name,
          shard: shard.shard,
          ...(screen ? { failureScreen: `failures/${screen}` } : {}),
        });
      }
    }
  }
  return any ? { planned, missing, labsNotOpened } : undefined;
}

/** Why the sweep is red, one reason a line; empty when it is green. */
export function sweepVerdict(
  result: SweepResult,
  findings: { readonly screenChecks: number; readonly uiQa: number },
): string[] {
  const reasons: string[] = [];
  if (findings.screenChecks > 0)
    reasons.push(`${String(findings.screenChecks)} screen-check finding(s)`);
  if (findings.uiQa > 0) reasons.push(`${String(findings.uiQa)} [ui-qa] line(s)`);
  if (result.labsNotOpened.length > 0)
    reasons.push(`${String(result.labsNotOpened.length)} lab(s) did not open`);
  if (result.planned > 0 && result.missing.length / result.planned > MISSING_LIMIT)
    reasons.push(
      `${String(result.missing.length)} of ${String(result.planned)} screenshots not captured (more than ${String(MISSING_LIMIT * 100)}%)`,
    );
  return reasons;
}

const LISTED = 80;

export function formatSweepResult(result: SweepResult, reasons: readonly string[]): string {
  const captured = result.planned - result.missing.length;
  const share = result.planned ? (result.missing.length / result.planned) * 100 : 0;
  const out = [
    '### Sweep',
    '',
    reasons.length ? `**Red:** ${reasons.join('; ')}.` : '**Green.**',
    '',
    `- Screenshots captured: **${String(captured)} of ${String(result.planned)}** (${share.toFixed(1)}% not captured; more than ${String(MISSING_LIMIT * 100)}% is red)`,
    `- Labs that did not open: ${result.labsNotOpened.length ? result.labsNotOpened.map((lab) => `\`${lab}\``).join(', ') : 'none'}`,
    '',
  ];
  if (result.missing.length === 0) return out.join('\n');
  out.push('**Not captured** (the failure screen is in the shard’s artifact)', '');
  for (const miss of result.missing.slice(0, LISTED))
    out.push(
      `- \`${miss.shot}\` (${path.basename(miss.flow)}, ${miss.shard}): ${miss.failureScreen ? `\`${miss.failureScreen}\`` : 'no failure screen'}`,
    );
  if (result.missing.length > LISTED)
    out.push(`- and ${String(result.missing.length - LISTED)} more`);
  out.push('');
  return out.join('\n');
}
