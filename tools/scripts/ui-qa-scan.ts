/**
 * Scans what the app's runtime UI checks reported during Maestro runs and fails on any report.
 *
 *   pnpm tsx tools/scripts/ui-qa-scan.ts <log-file...>
 *
 * Development and e2e builds write every `[ui-qa]` report (a headline cut with an ellipsis, a word
 * split across lines, a critter drawn without its sticker edge) to `<documents>/ui-qa.log` in the
 * app's container (and logs it, which is how an Android emulator run reads it back from logcat).
 * `pnpm screens:capture` pulls the reports after each flow, and fails the run when `scanUiQa` finds anything.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');
export const UI_QA_TAG = '[ui-qa]';
/** Where the app writes its reports, inside its data container (see apps/mobile/src/ui/qa). */
export const UI_QA_LOG = 'Documents/ui-qa.log';

export interface UiQaReport {
  readonly code: string;
  readonly subject: string;
  readonly line: string;
}

/** Every distinct `[ui-qa]` report in a log (other lines ignored), in first-seen order. */
export function scanUiQa(log: string): UiQaReport[] {
  const seen = new Set<string>();
  const reports: UiQaReport[] = [];
  for (const raw of log.split('\n')) {
    const at = raw.indexOf(UI_QA_TAG);
    if (at < 0) continue;
    const line = raw.slice(at).trim();
    if (seen.has(line)) continue;
    seen.add(line);
    const [, code = '', ...rest] = line.split(' ');
    reports.push({ code, subject: rest.join(' '), line });
  }
  return reports;
}

/** A readable summary: one line per report, grouped under the flow that produced it. */
export function formatUiQa(byFlow: ReadonlyMap<string, readonly UiQaReport[]>): string {
  const blocks: string[] = [];
  for (const [flow, reports] of byFlow) {
    if (reports.length === 0) continue;
    blocks.push([`${flow}:`, ...reports.map((report) => `  ${report.line}`)].join('\n'));
  }
  return blocks.join('\n');
}

/** The data container of an installed app on a simulator, or undefined when it has none yet. */
function dataContainer(udid: string, appId: string): string | undefined {
  const result = spawnSync('xcrun', ['simctl', 'get_app_container', udid, appId, 'data'], {
    encoding: 'utf8',
  });
  return result.status === 0 ? result.stdout.trim() || undefined : undefined;
}

/** Reads and clears the app's report file, so the next flow starts from an empty log. */
export function pullUiQaLog(udid: string, appId: string): string {
  const container = dataContainer(udid, appId);
  if (!container) return '';
  const file = path.join(container, UI_QA_LOG);
  if (!existsSync(file)) return '';
  const log = readFileSync(file, 'utf8');
  rmSync(file, { force: true });
  return log;
}

/** `appId:` from a Maestro flow's header. */
export function flowAppId(flowYaml: string): string | undefined {
  return /^appId:\s*['"]?([\w.-]+)['"]?\s*$/m.exec(flowYaml)?.[1];
}

/**
 * After a flow (a Maestro file): pulls what the app reported during it into `byFlow`. `readLog`
 * returns (and clears) the device's report source for an app id: `pullUiQaLog` on a simulator,
 * logcat on an Android emulator.
 */
export function recordFlowUiQa(
  byFlow: Map<string, UiQaReport[]>,
  flow: string,
  readLog: (appId: string) => string,
): void {
  const appId = flowAppId(readFileSync(flow, 'utf8'));
  if (appId) byFlow.set(path.relative(REPO_ROOT, flow), scanUiQa(readLog(appId)));
}

/** Writes `<out>/ui-qa.log` (empty when clean) and throws when the app reported anything. */
export function failOnUiQa(byFlow: ReadonlyMap<string, readonly UiQaReport[]>, out: string): void {
  const summary = formatUiQa(byFlow);
  writeFileSync(path.join(out, 'ui-qa.log'), summary ? `${summary}\n` : '');
  if (summary) throw new Error(`The app reported UI problems (${UI_QA_TAG}):\n${summary}`);
  console.log('ui-qa: no reports');
}

function main(): void {
  const files = process.argv.slice(2).filter((arg) => arg !== '--');
  if (files.length === 0) {
    console.error('Usage: ui-qa-scan <log-file...>');
    process.exitCode = 1;
    return;
  }
  const byFile = new Map(files.map((file) => [file, scanUiQa(readFileSync(file, 'utf8'))]));
  const total = [...byFile.values()].reduce((sum, reports) => sum + reports.length, 0);
  if (total === 0) {
    console.log('ui-qa: no reports');
    return;
  }
  console.error(`ui-qa: ${String(total)} report(s)\n${formatUiQa(byFile)}`);
  process.exitCode = 1;
}

const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;
if (isMainModule) main();
