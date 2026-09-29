/**
 * Runs one shard of Maestro flows on a booted simulator or emulator that already has the app.
 *
 *   tsx tools/scripts/ci-device/run-shard.ts --platform ios --device <udid|serial> --out <dir> \
 *     [--env OTP_TEST_CODE --env JS_COMMIT] <flow.yaml…>
 *
 * Writes to --out: `junit/*.xml` and `maestro/<flow>/` (Maestro's run directory and logs) per flow,
 * `failures/` (the screen and the app's log after each failed flow), `screenshots/*.png` (every
 * `takeScreenshot`, named as `pnpm screens:capture` names them) and `ui-qa.log`. Like the local capture tool, a failed flow or any `[ui-qa]` report fails the shard;
 * on GitHub Actions each also becomes an error annotation and a line in the job summary.
 * `--env NAME` forwards that environment variable to every flow as `-e NAME=value` when it is set.
 */
import { spawnSync } from 'node:child_process';
import {
  appendFileSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import { flowScreenshotNames, planCopies, type FlowScreens } from '../capture-flow-shots';
import { failOnUiQa, recordFlowUiQa, scanUiQa, type UiQaReport } from '../ui-qa-scan';
import type { DevicePlatform } from './plan-shards';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const MAESTRO = process.env.MAESTRO_BIN ?? path.join(homedir(), '.maestro/bin/maestro');

export interface ShardOptions {
  platform: DevicePlatform;
  device: string;
  out: string;
  env: string[];
  flows: string[];
}

export function parseShardArgs(argv: string[], baseDir: string): ShardOptions {
  const { values, positionals } = parseArgs({
    args: argv.filter((arg, index) => !(index === 0 && arg === '--')),
    allowPositionals: true,
    options: {
      platform: { type: 'string' },
      device: { type: 'string' },
      out: { type: 'string' },
      env: { type: 'string', multiple: true },
    },
  });
  const { platform, device, out } = values;
  if (platform !== 'ios' && platform !== 'android') throw new Error('--platform: ios or android');
  if (!device) throw new Error('--device is required');
  if (!out) throw new Error('--out is required');
  const flows = positionals.flatMap((arg) => arg.split(/\s+/)).filter(Boolean);
  if (flows.length === 0) throw new Error('No flows given');
  return {
    platform,
    device,
    out: path.resolve(baseDir, out),
    env: values.env ?? [],
    flows: flows.map((flow) => path.resolve(baseDir, flow)),
  };
}

/** A flow's file-name-safe label: `e2e/home/first-run.yaml` → `e2e__home__first-run`. */
export function flowSlug(flow: string, root: string): string {
  return path
    .relative(root, flow)
    .replace(/\.ya?ml$/, '')
    .replace(/[\\/]/g, '__');
}

/** `-e NAME=value` pairs for the named variables that are set. */
export function maestroEnvArgs(names: readonly string[], env: NodeJS.ProcessEnv): string[] {
  return names.flatMap((name) => {
    const value = env[name];
    return value === undefined || value === '' ? [] : ['-e', `${name}=${value}`];
  });
}

/** Maestro names the screenshot it takes when a flow fails `screenshot-❌-<time>-(<flow>)`. */
export function isMaestroFailureShot(name: string): boolean {
  return name.startsWith('screenshot-❌-');
}

/** A GitHub Actions workflow command, with its data escaped. */
export function annotation(level: 'error' | 'warning', title: string, message: string): string {
  const escape = (text: string) =>
    text.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
  return `::${level} title=${escape(title).replace(/[:,]/g, ' ')}::${escape(message)}`;
}

function adb(serial: string, args: string[]): string {
  const result = spawnSync('adb', ['-s', serial, ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  return result.status === 0 ? result.stdout : '';
}

/** Runs the flows; returns the failed ones. Screenshots from passing and failing flows are kept. */
export function runShard(options: ShardOptions): {
  failed: string[];
  uiQa: Map<string, UiQaReport[]>;
} {
  if (!existsSync(MAESTRO)) throw new Error(`Maestro not found at ${MAESTRO}`);
  const work = path.join(options.out, 'maestro');
  const shots = path.join(options.out, 'screenshots');
  for (const dir of [work, shots, path.join(options.out, 'junit')])
    mkdirSync(dir, { recursive: true });
  const envArgs = maestroEnvArgs(options.env, process.env);
  const failed: string[] = [];
  const uiQa = new Map<string, UiQaReport[]>();
  const results: FlowScreens[] = options.flows.map((flow) => {
    const slug = flowSlug(flow, REPO_ROOT);
    const dir = path.join(work, slug);
    mkdirSync(dir, { recursive: true });
    const label = path.relative(REPO_ROOT, flow);
    if (options.platform === 'android') adb(options.device, ['logcat', '-c']);
    console.log(`::group::${label}`);
    const started = Date.now();
    const result = spawnSync(
      MAESTRO,
      [
        '--device',
        options.device,
        'test',
        flow,
        '--format',
        'junit',
        '--output',
        path.join(options.out, 'junit', `${slug}.xml`),
        '--test-output-dir',
        dir,
        '--debug-output',
        dir,
        '--flatten-debug-output',
        ...envArgs,
      ],
      {
        cwd: dir,
        stdio: 'inherit',
        env: { ...process.env, MAESTRO_DRIVER_STARTUP_TIMEOUT: '360000' },
      },
    );
    console.log('::endgroup::');
    const seconds = Math.round((Date.now() - started) / 1000);
    const passed = result.status === 0;
    console.log(`${passed ? 'PASS' : 'FAIL'} ${label} (${String(seconds)}s)`);
    if (!passed) {
      failed.push(label);
      console.log(annotation('error', `Maestro flow failed (${options.platform})`, label));
      captureFailure(options, slug);
    }
    if (options.platform === 'ios') {
      recordFlowUiQa(uiQa, flow, options.device);
    } else {
      uiQa.set(label, scanUiQa(adb(options.device, ['logcat', '-d', '-s', 'ReactNativeJS:V'])));
    }
    summary(`| ${passed ? 'pass' : '**fail**'} | \`${label}\` | ${String(seconds)}s |`);
    // Maestro's own `screenshot-❌-…` failure images stay in the flow's run directory.
    const names = flowScreenshotNames(flow, dir).filter((name) => !isMaestroFailureShot(name));
    return { flow, dir, names };
  });
  for (const { from, to } of planCopies(results, shots)) {
    if (existsSync(from)) copyFileSync(from, to);
  }
  return { failed, uiQa };
}

/** The device's screen and the app's recent log after a failed flow, into `<out>/failures/`. */
function captureFailure(options: ShardOptions, slug: string): void {
  const dir = path.join(options.out, 'failures');
  mkdirSync(dir, { recursive: true });
  const save = (file: string, command: string, args: string[]) => {
    const result = spawnSync(command, args, { maxBuffer: 256 * 1024 * 1024 });
    if (result.status === 0) writeFileSync(path.join(dir, file), result.stdout);
  };
  if (options.platform === 'android') {
    save(`${slug}.png`, 'adb', ['-s', options.device, 'exec-out', 'screencap', '-p']);
    save(`${slug}.logcat.txt`, 'adb', ['-s', options.device, 'logcat', '-d', '-b', 'all']);
    save(`${slug}.crash.txt`, 'adb', ['-s', options.device, 'logcat', '-d', '-b', 'crash']);
  } else {
    save(`${slug}.png`, 'xcrun', ['simctl', 'io', options.device, 'screenshot', '-']);
    const predicate = 'process BEGINSWITH "CritterPass" OR subsystem == "com.facebook.react.log"';
    const logArgs = ['simctl', 'spawn', options.device, 'log', 'show', '--last', '10m'];
    save(`${slug}.log.txt`, 'xcrun', [...logArgs, '--style', 'compact', '--predicate', predicate]);
  }
}

function summary(line: string): void {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) appendFileSync(file, `${line}\n`);
}

function main(): void {
  const options = parseShardArgs(process.argv.slice(2), process.cwd());
  summary(`### ${options.platform} shard\n\n| result | flow | time |\n| --- | --- | --- |`);
  const { failed, uiQa } = runShard(options);
  for (const [flow, reports] of uiQa) {
    for (const report of reports)
      console.log(annotation('error', `ui-qa ${report.code}`, `${flow}: ${report.line}`));
  }
  try {
    failOnUiQa(uiQa, options.out);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    summary(
      `\n\`[ui-qa]\` reports:\n\n\`\`\`\n${readFileSync(path.join(options.out, 'ui-qa.log'), 'utf8')}\`\`\``,
    );
    process.exitCode = 1;
  }
  if (failed.length > 0) {
    console.error(`Maestro flow(s) failed: ${failed.join(', ')}`);
    process.exitCode = 1;
  }
}

const isMainModule = import.meta.url === `file://${process.argv[1] ?? ''}`;
if (isMainModule) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
