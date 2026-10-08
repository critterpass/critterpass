/**
 * How a shard treats a flow that fails or runs too long (run-shard.ts), and how that is written
 * into the flow's JUnit report so the summaries can show it (run-summary.ts, release-gate.ts).
 *
 * A failed flow runs once more on a relaunched app. A pass on that second run is reported as
 * "passed on retry", never as a plain pass: the first failure's files are kept under
 * `first-failure/` in the shard's artifact and the JUnit report carries the outcome and the first
 * failure's message. A flow that runs past the time limit is stopped and reported as timed out; it
 * is not run again, since a second run would cost the shard the same time.
 */
import { existsSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import path from 'node:path';

export type AttemptResult = 'passed' | 'failed' | 'timed out';
export type FlowOutcome = 'passed' | 'passed on retry' | 'failed' | 'timed out';

/**
 * Minutes one flow may run: three times the longest median the release gate has recorded
 * (`e2e/happy/fresh-join-under-way.yaml`, 31 minutes on Android).
 */
export const DEFAULT_FLOW_TIMEOUT_MINUTES = 90;

/** The limit from the `flow_timeout` input (FLOW_TIMEOUT_MINUTES); empty means the default. */
export function flowTimeoutMinutes(input: string | undefined): number {
  const text = (input ?? '').trim();
  if (text === '') return DEFAULT_FLOW_TIMEOUT_MINUTES;
  const minutes = Number(text);
  if (!Number.isFinite(minutes) || minutes <= 0)
    throw new Error(`The flow time limit must be a number of minutes above zero, not "${text}"`);
  return minutes;
}

/** What one Maestro process ended as; Node reports a process it stopped at the limit as ETIMEDOUT. */
export function attemptResult(ended: {
  status: number | null;
  error?: Error | undefined;
}): AttemptResult {
  if ((ended.error as NodeJS.ErrnoException | undefined)?.code === 'ETIMEDOUT') return 'timed out';
  return ended.status === 0 ? 'passed' : 'failed';
}

/** One more run after a failure; none after a pass, a timeout or a retry. */
export function shouldRetry(attempts: readonly AttemptResult[]): boolean {
  return attempts.length === 1 && attempts[0] === 'failed';
}

export function flowOutcome(attempts: readonly AttemptResult[]): FlowOutcome {
  const last = attempts.at(-1) ?? 'failed';
  if (last !== 'passed') return last;
  return attempts.length > 1 ? 'passed on retry' : 'passed';
}

/** The result column of the job summary's flow table. */
export const RESULT_CELL: Record<FlowOutcome, string> = {
  passed: 'pass',
  'passed on retry': 'pass (on retry)',
  failed: '**fail**',
  'timed out': '**timed out**',
};

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function unescapeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

export const TIMED_OUT_PREFIX = 'Timed out';
const OUTCOME = 'outcome';
const FIRST_FAILURE = 'first-failure';

/** The report of a flow stopped at the limit: Maestro, stopped mid-flow, writes none. */
export function timedOutJunit(name: string, seconds: number, limitMinutes: number): string {
  const time = String(seconds);
  const message = `${TIMED_OUT_PREFIX}: stopped after ${String(limitMinutes)} minutes (the flow time limit)`;
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<testsuites>',
    `  <testsuite name="Test Suite" tests="1" failures="1" time="${time}">`,
    `    <testcase id="${escapeXml(name)}" name="${escapeXml(name)}" time="${time}" status="ERROR">`,
    `      <failure>${escapeXml(message)}</failure>`,
    '    </testcase>',
    '  </testsuite>',
    '</testsuites>',
    '',
  ].join('\n');
}

/** A failure message of a JUnit report, or undefined when it has none. */
export function junitFailure(xml: string): string | undefined {
  const failure = /<(failure|error)\b[^>]*?(?:\/>|>([\s\S]*?)<\/\1>)/.exec(xml);
  if (!failure) return undefined;
  return unescapeXml(failure[2] ?? '').trim() || 'failed';
}

/** Marks a passing report as passed on retry, with what the first run failed on. */
export function markPassedOnRetry(xml: string, firstFailure: string): string {
  const properties =
    `<properties><property name="${OUTCOME}" value="passed on retry"/>` +
    `<property name="${FIRST_FAILURE}" value="${escapeXml(firstFailure.replace(/\s+/g, ' ').slice(0, 300))}"/></properties>`;
  return xml.replace(/<testsuite\b(?:[^>]*[^/>])?>/, (open) => `${open}${properties}`);
}

function property(xml: string, name: string): string | undefined {
  const value = new RegExp(`<property name="${name}" value="([^"]*)"`).exec(xml)?.[1];
  return value === undefined ? undefined : unescapeXml(value);
}

export interface ReportedOutcome {
  readonly outcome: FlowOutcome;
  /** The final failure, or the first run's failure of a flow that passed on retry. */
  readonly failure?: string;
}

/** The outcome a JUnit report holds, as the summaries show it. */
export function reportedOutcome(xml: string): ReportedOutcome {
  const failure = junitFailure(xml);
  if (failure !== undefined)
    return { outcome: failure.startsWith(TIMED_OUT_PREFIX) ? 'timed out' : 'failed', failure };
  if (property(xml, OUTCOME) !== 'passed on retry') return { outcome: 'passed' };
  const first = property(xml, FIRST_FAILURE);
  return { outcome: 'passed on retry', ...(first ? { failure: first } : {}) };
}

/**
 * Moves what a flow's failed first run left in the shard's output (`junit/<slug>.xml`,
 * `maestro/<slug>/`, `failures/<slug>.*`, `videos/<slug>/`) to the same places under
 * `first-failure/`, so the second run starts clean and both are in the artifact.
 */
export function keepFirstFailure(out: string, slug: string): void {
  const kept = path.join(out, 'first-failure');
  const move = (folder: string, name: string) => {
    const from = path.join(out, folder, name);
    if (!existsSync(from)) return;
    mkdirSync(path.join(kept, folder), { recursive: true });
    renameSync(from, path.join(kept, folder, name));
  };
  move('junit', `${slug}.xml`);
  move('maestro', slug);
  move('videos', slug);
  const failures = path.join(out, 'failures');
  if (!existsSync(failures)) return;
  for (const file of readdirSync(failures)) if (file.startsWith(`${slug}.`)) move('failures', file);
}
