/**
 * Launch timings of a device shard, read from what Maestro already records: every flow run with
 * `--debug-output` leaves a `commands-(<flow>).json` holding each command's start time and
 * duration. For every cold `launchApp` this takes
 *
 *   launchMs  how long the launch command took (the app is killed, started and in the foreground)
 *   readyMs   from the start of the launch to the end of the wait for the first screen, when the
 *             flow waits for an element right after launching
 *
 * and writes `<dir>/perf/device-timings.json` plus a table in the job summary.
 *
 *   npx tsx tools/scripts/perf/device-timings.ts --dir <shard out dir> --platform android|ios
 *
 * These are recorded, never judged: a CI emulator or simulator is not a reference device, and
 * Maestro's clock includes its own polling, so the numbers bound the budgets in budgets.json from
 * above and show drift between runs. The command always exits 0.
 */
import { appendFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { median } from './cold-start';

interface RecordedCommand {
  readonly command?: Readonly<Record<string, unknown>>;
  readonly metadata?: {
    readonly status?: string;
    readonly timestamp?: number;
    readonly duration?: number;
  };
}

export interface LaunchTiming {
  readonly appId: string;
  /** The launch also wiped the app's data: a first run, with onboarding and an empty database. */
  readonly clearState: boolean;
  readonly launchMs: number;
  readonly readyMs: number | undefined;
  /** The element the flow waited for, as written in the flow. */
  readonly readyOn: string | undefined;
}

export interface FlowTimings {
  readonly flow: string;
  readonly launches: readonly LaunchTiming[];
}

// Commands that neither touch the app nor wait for it: they may sit between a launch and its wait.
const PASSIVE = new Set(['defineVariablesCommand', 'applyConfigurationCommand']);

function selectorLabel(condition: unknown): string | undefined {
  const visible = (condition as { visible?: Record<string, unknown> } | undefined)?.visible;
  if (!visible) return undefined;
  const value = visible.idRegex ?? visible.textRegex;
  return typeof value === 'string' ? value : undefined;
}

/**
 * Cold launches in one Maestro commands file. A launch that keeps the app running
 * (`stopApp: false`) is a resume and is left out, as are launches that failed.
 */
export function parseLaunches(commands: readonly RecordedCommand[]): LaunchTiming[] {
  const ordered = commands
    .filter((c) => c.command && typeof c.metadata?.timestamp === 'number')
    .sort((a, b) => (a.metadata?.timestamp ?? 0) - (b.metadata?.timestamp ?? 0));
  const launches: LaunchTiming[] = [];
  ordered.forEach((entry, index) => {
    const launch = entry.command?.launchAppCommand as
      { appId?: string; clearState?: boolean; stopApp?: boolean } | undefined;
    const meta = entry.metadata;
    if (!launch || launch.stopApp === false || meta?.status !== 'COMPLETED') return;
    if (typeof meta.timestamp !== 'number' || typeof meta.duration !== 'number') return;

    let readyMs: number | undefined;
    let readyOn: string | undefined;
    for (const next of ordered.slice(index + 1)) {
      const name = Object.keys(next.command ?? {})[0] ?? '';
      if (PASSIVE.has(name)) continue;
      const wait = next.command?.assertConditionCommand as { condition?: unknown } | undefined;
      const label = selectorLabel(wait?.condition);
      const nextMeta = next.metadata;
      if (
        label !== undefined &&
        nextMeta?.status === 'COMPLETED' &&
        typeof nextMeta.timestamp === 'number' &&
        typeof nextMeta.duration === 'number'
      ) {
        readyMs = nextMeta.timestamp + nextMeta.duration - meta.timestamp;
        readyOn = label;
      }
      break;
    }
    launches.push({
      appId: launch.appId ?? '',
      clearState: launch.clearState === true,
      launchMs: meta.duration,
      readyMs,
      readyOn,
    });
  });
  return launches;
}

export interface TimingSummary {
  readonly launches: number;
  readonly launchMsMedian: number | undefined;
  readonly readyMsMedian: number | undefined;
  /** Launches into an app that keeps its data: the case the cold-start budget describes. */
  readonly readyMsMedianKeptData: number | undefined;
}

export function summarise(flows: readonly FlowTimings[]): TimingSummary {
  const all = flows.flatMap((f) => f.launches);
  const ready = (list: readonly LaunchTiming[]) =>
    median(list.flatMap((l) => (l.readyMs === undefined ? [] : [l.readyMs])));
  return {
    launches: all.length,
    launchMsMedian: median(all.map((l) => l.launchMs)),
    readyMsMedian: ready(all),
    readyMsMedianKeptData: ready(all.filter((l) => !l.clearState)),
  };
}

export function timingsTable(flows: readonly FlowTimings[]): string {
  const cell = (n: number | undefined) => (n === undefined ? '–' : `${String(Math.round(n))} ms`);
  const rows = flows.flatMap((f) =>
    f.launches.map(
      (l) =>
        `| \`${f.flow}\` | ${l.clearState ? 'fresh install' : 'kept data'} | ${cell(l.launchMs)} | ${cell(l.readyMs)} | ${l.readyOn ? `\`${l.readyOn}\`` : '–'} |`,
    ),
  );
  return [
    '| Flow | Launch | Launch command | Launch to first screen | Waited for |',
    '|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}

/** `commands-(<flow>.yaml).json` files under `dir`, at any depth. */
export function commandFiles(dir: string): string[] {
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .filter((name) => /(^|[\\/])commands-.*\.json$/u.test(name))
    .map((name) => path.join(dir, name))
    .sort();
}

export function collect(dir: string): FlowTimings[] {
  const flows: FlowTimings[] = [];
  for (const file of commandFiles(dir)) {
    try {
      const launches = parseLaunches(JSON.parse(readFileSync(file, 'utf8')) as RecordedCommand[]);
      if (launches.length === 0) continue;
      // Each flow runs in `<dir>/maestro/<flow slug>/`; subflows leave their own files there.
      const flow = path.basename(path.dirname(file));
      const existing = flows.find((f) => f.flow === flow);
      if (existing)
        flows[flows.indexOf(existing)] = { flow, launches: [...existing.launches, ...launches] };
      else flows.push({ flow, launches });
    } catch {
      // An unreadable or half-written file (a flow killed mid-run) is skipped.
    }
  }
  return flows;
}

function main(): void {
  const args = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'));
  const { values } = parseArgs({
    args,
    options: { dir: { type: 'string' }, platform: { type: 'string', default: 'android' } },
  });
  if (!values.dir) throw new Error('--dir is required');
  const flows = collect(path.join(values.dir, 'maestro'));
  const summary = summarise(flows);
  const out = path.join(values.dir, 'perf');
  mkdirSync(out, { recursive: true });
  writeFileSync(
    path.join(out, 'device-timings.json'),
    `${JSON.stringify({ platform: values.platform, summary, flows }, null, 2)}\n`,
  );
  const cell = (n: number | undefined) => (n === undefined ? '–' : `${String(Math.round(n))} ms`);
  const text = [
    `## Launch timings (${values.platform}, recorded, not judged)`,
    '',
    `${String(summary.launches)} cold launches. Median launch command ${cell(summary.launchMsMedian)}; median launch to first screen ${cell(summary.readyMsMedian)} (${cell(summary.readyMsMedianKeptData)} when the app kept its data).`,
    '',
    flows.length > 0 ? timingsTable(flows) : 'No flow in this shard launched the app cold.',
    '',
  ].join('\n');
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  try {
    main();
  } catch (error) {
    // A measurement is never a reason to fail a shard.
    console.log(
      `launch timings not recorded: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
