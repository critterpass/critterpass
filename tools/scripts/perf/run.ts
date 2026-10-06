/**
 * Performance gate: gathers whatever measurements this run has, compares them with budgets.json
 * (docs/system-architecture.md §9) and fails on any breach. Device numbers come from files the
 * device workflow writes (or a connected Android device with `--adb`); server numbers from
 * Grafana when `GRAFANA_URL`, `GRAFANA_TOKEN` and `GRAFANA_PROM_DATASOURCE_UID` are set.
 *
 *   pnpm tsx tools/scripts/perf/run.ts --ci [--android-launch am-start.txt | --adb app.critterpass.staging]
 *     [--ios-launch launch-ms.txt] [--gfxinfo gfxinfo.txt] [--ipa app.ipa] [--env staging] [--out perf.json] [--strict]
 *
 * A metric without input is reported as skipped; `--strict` fails on skipped metrics too.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import { QUERIES, queryGrafana } from './api-p95';
import { fileMb } from './bundle';
import { measureAndroid, median, parseAmStart, parseMsLines } from './cold-start';
import { parseGfxinfo } from './frames';

export interface Budgets {
  readonly coldStartMs: { readonly android: number; readonly ios: number };
  readonly androidMinFps: number;
  readonly iosDownloadMb: number;
  readonly commandP95Ms: number;
  readonly dbP50Ms: number;
}

export interface Measurement {
  readonly metric: string;
  readonly value: number | undefined;
  readonly budget: number;
  /** `max`: the value must not exceed the budget; `min`: must not fall below it. */
  readonly kind: 'max' | 'min';
  readonly unit: string;
}

export type Verdict = 'pass' | 'fail' | 'skipped';

export function verdict(m: Measurement): Verdict {
  if (m.value === undefined) return 'skipped';
  return (m.kind === 'max' ? m.value <= m.budget : m.value >= m.budget) ? 'pass' : 'fail';
}

export function report(measurements: readonly Measurement[], strict: boolean) {
  const rows = measurements.map((m) => ({ ...m, verdict: verdict(m) }));
  const failed = rows.some((r) => r.verdict === 'fail' || (strict && r.verdict === 'skipped'));
  const table = [
    '| Metric | Value | Budget | Result |',
    '|---|---|---|---|',
    ...rows.map(
      (r) =>
        `| ${r.metric} | ${r.value === undefined ? '–' : `${r.value} ${r.unit}`} | ${r.kind === 'max' ? '≤' : '≥'} ${r.budget} ${r.unit} | ${r.verdict} |`,
    ),
  ].join('\n');
  return { rows, failed, table };
}

const read = (file: string | undefined) => (file ? readFileSync(file, 'utf8') : undefined);

async function main(): Promise<void> {
  const args = process.argv.slice(2).filter((arg, index) => !(index === 0 && arg === '--'));
  const { values } = parseArgs({
    args,
    options: {
      ci: { type: 'boolean', default: false },
      strict: { type: 'boolean', default: false },
      'android-launch': { type: 'string' },
      adb: { type: 'string' },
      'ios-launch': { type: 'string' },
      gfxinfo: { type: 'string' },
      ipa: { type: 'string' },
      env: { type: 'string', default: 'staging' },
      window: { type: 'string', default: '24h' },
      out: { type: 'string' },
    },
  });
  const budgets = JSON.parse(
    readFileSync(new URL('./budgets.json', import.meta.url), 'utf8'),
  ) as Budgets;

  const androidLaunch = values.adb ? measureAndroid(values.adb) : read(values['android-launch']);
  const iosLaunch = read(values['ios-launch']);
  const gfx = read(values.gfxinfo);
  const frames = gfx ? parseGfxinfo(gfx) : undefined;

  const { GRAFANA_URL, GRAFANA_TOKEN, GRAFANA_PROM_DATASOURCE_UID } = process.env;
  const grafana =
    GRAFANA_URL && GRAFANA_TOKEN && GRAFANA_PROM_DATASOURCE_UID
      ? (expr: string) =>
          queryGrafana(GRAFANA_URL, GRAFANA_TOKEN, GRAFANA_PROM_DATASOURCE_UID, expr)
      : undefined;
  const round = (n: number | undefined) => (n === undefined ? undefined : Math.round(n * 10) / 10);

  const measurements: Measurement[] = [
    {
      metric: 'cold start, Android',
      value: androidLaunch ? median(parseAmStart(androidLaunch)) : undefined,
      budget: budgets.coldStartMs.android,
      kind: 'max',
      unit: 'ms',
    },
    {
      metric: 'cold start, iOS',
      value: iosLaunch ? median(parseMsLines(iosLaunch)) : undefined,
      budget: budgets.coldStartMs.ios,
      kind: 'max',
      unit: 'ms',
    },
    {
      metric: 'frame rate (p90), Android',
      value: frames?.fps,
      budget: budgets.androidMinFps,
      kind: 'min',
      unit: 'fps',
    },
    {
      metric: 'iOS download size',
      value: values.ipa ? fileMb(values.ipa) : undefined,
      budget: budgets.iosDownloadMb,
      kind: 'max',
      unit: 'MB',
    },
    {
      metric: `command p95 (${values.env}, ${values.window})`,
      value: round(await grafana?.(QUERIES.commandP95Ms(values.env, values.window))),
      budget: budgets.commandP95Ms,
      kind: 'max',
      unit: 'ms',
    },
    {
      metric: `api → db p50 (${values.env}, ${values.window})`,
      value: round(await grafana?.(QUERIES.dbP50Ms(values.env, values.window))),
      budget: budgets.dbP50Ms,
      kind: 'max',
      unit: 'ms',
    },
  ];
  const result = report(measurements, values.strict);
  console.log(result.table);
  if (values.out) writeFileSync(values.out, `${JSON.stringify(result.rows, null, 2)}\n`);
  if (values.ci && process.env.GITHUB_STEP_SUMMARY) {
    writeFileSync(process.env.GITHUB_STEP_SUMMARY, `## Performance budgets\n\n${result.table}\n`, {
      flag: 'a',
    });
  }
  process.exitCode = result.failed ? 1 : 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
