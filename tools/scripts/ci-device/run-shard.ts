/**
 * Runs one shard of Maestro flows on a booted simulator or emulator that already has the app.
 *
 *   tsx tools/scripts/ci-device/run-shard.ts --platform ios --device <udid|serial> --out <dir> \
 *     [--env OTP_TEST_CODE --env JS_COMMIT] [--video] <flow.yaml…>
 *
 * Writes to --out: `junit/*.xml` and `maestro/<flow>/` (Maestro's run directory and logs) per flow,
 * `failures/` (the screen and the app's log after each failed flow), `screenshots/*.png` (every
 * `takeScreenshot`, named as `pnpm screens:capture` names them), `ui-qa.log` and `screen-checks.log`
 * (the pixel checks of ./screen-checks on every screenshot). Like the local capture tool, a failed
 * flow or any `[ui-qa]` report fails the shard, and so does any screen-check finding;
 * on GitHub Actions each also becomes an error annotation and a line in the job summary.
 * `--env NAME` forwards that environment variable to every flow as `-e NAME=value` when it is set.
 * `--video` records the screen during each flow into `videos/<flow>/` (./screen-video);
 * `SAVE_HIERARCHY=true` saves each Android flow's last screen (./screen-hierarchy).
 * A failed flow runs once more on a relaunched app and a flow past `--flow-timeout <minutes>` is
 * stopped (./flow-attempts): "passed on retry" and "timed out" are in the log, the job summary
 * and the flow's JUnit report, and the first failure's files are kept in `first-failure/`.
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
import { failOnUiQa, pullUiQaLog, recordFlowUiQa, scanUiQa, type UiQaReport } from '../ui-qa-scan';
import { adb, captureFailure, relaunchApp, startRunnerActions } from './device-state';
import { recordFlowMeasurements } from './encode-totals';
import {
  attemptResult,
  flowOutcome,
  flowTimeoutMinutes,
  junitFailure,
  keepFirstFailure,
  markPassedOnRetry,
  RESULT_CELL,
  shouldRetry,
  timedOutJunit,
  type AttemptResult,
} from './flow-attempts';
import type { DevicePlatform } from './plan-shards';
import { saveHierarchy } from './screen-hierarchy';
import { appBackground, scanScreenshots, SCREEN_CHECKS_LOG, writeFindings } from './screen-scan';
import { startScreenRecorder } from './screen-video';
import { isNotCaptured, shardFailures } from './sweep-result';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
const MAESTRO = process.env.MAESTRO_BIN ?? path.join(homedir(), '.maestro/bin/maestro');

export interface ShardOptions {
  platform: DevicePlatform;
  device: string;
  out: string;
  env: string[];
  video: boolean;
  /** Minutes one flow may run before it is stopped. */
  flowTimeoutMinutes: number;
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
      video: { type: 'boolean', default: false },
      'flow-timeout': { type: 'string' },
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
    video: values.video,
    flowTimeoutMinutes: flowTimeoutMinutes(values['flow-timeout']),
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

/** One Maestro run of one flow, stopped at the time limit; its report goes to `junit/<slug>.xml`. */
function runAttempt(options: ShardOptions, flow: string, slug: string, envArgs: string[]) {
  const dir = path.join(options.out, 'maestro', slug);
  const junit = path.join(options.out, 'junit', `${slug}.xml`);
  mkdirSync(dir, { recursive: true });
  const recorder = options.video
    ? startScreenRecorder(options.platform, options.device, path.join(options.out, 'videos', slug))
    : undefined;
  const started = Date.now();
  const ended = spawnSync(
    MAESTRO,
    [
      ...['--device', options.device, 'test', flow, '--format', 'junit', '--output', junit],
      ...['--test-output-dir', dir, '--debug-output', dir, '--flatten-debug-output'],
      ...envArgs,
    ],
    {
      cwd: dir,
      stdio: 'inherit',
      env: { ...process.env, MAESTRO_DRIVER_STARTUP_TIMEOUT: '360000' },
      timeout: options.flowTimeoutMinutes * 60_000,
    },
  );
  recorder?.stop();
  const seconds = Math.round((Date.now() - started) / 1000);
  const result = attemptResult(ended);
  if (result === 'timed out')
    writeFileSync(junit, timedOutJunit(slug, seconds, options.flowTimeoutMinutes));
  if (result !== 'passed') captureFailure(options.platform, options.device, options.out, slug);
  return { result, seconds, junit };
}

/**
 * Runs the flows; returns the ones that failed or timed out, and the ones that passed only on
 * their retry. Screenshots from passing and failing flows are kept.
 */
export function runShard(options: ShardOptions): {
  failed: string[];
  retried: string[];
  uiQa: Map<string, UiQaReport[]>;
} {
  if (!existsSync(MAESTRO)) throw new Error(`Maestro not found at ${MAESTRO}`);
  const shots = path.join(options.out, 'screenshots');
  for (const dir of [shots, path.join(options.out, 'junit')]) mkdirSync(dir, { recursive: true });
  const envArgs = maestroEnvArgs(options.env, process.env);
  const failed: string[] = [];
  const retried: string[] = [];
  const uiQa = new Map<string, UiQaReport[]>();
  const results: FlowScreens[] = options.flows.map((flow) => {
    const slug = flowSlug(flow, REPO_ROOT);
    const label = path.relative(REPO_ROOT, flow);
    if (options.platform === 'android') adb(options.device, ['logcat', '-c']);
    console.log(`::group::${label}`);
    let attempt = runAttempt(options, flow, slug, envArgs);
    const attempts: AttemptResult[] = [attempt.result];
    let seconds = attempt.seconds;
    if (shouldRetry(attempts)) {
      const firstFailure = existsSync(attempt.junit)
        ? (junitFailure(readFileSync(attempt.junit, 'utf8')) ?? 'failed')
        : 'failed';
      console.log(`FAIL ${label} (${String(seconds)}s): running it once more on a relaunched app`);
      keepFirstFailure(options.out, slug);
      relaunchApp(options.platform, options.device, flow);
      attempt = runAttempt(options, flow, slug, envArgs);
      attempts.push(attempt.result);
      seconds += attempt.seconds;
      if (attempt.result === 'passed' && existsSync(attempt.junit))
        writeFileSync(
          attempt.junit,
          markPassedOnRetry(readFileSync(attempt.junit, 'utf8'), firstFailure),
        );
    }
    console.log('::endgroup::');
    const outcome = flowOutcome(attempts);
    console.log(`${outcome.toUpperCase()} ${label} (${String(seconds)}s)`);
    if (outcome === 'failed' || outcome === 'timed out') {
      failed.push(label);
      console.log(annotation('error', `Maestro flow ${outcome} (${options.platform})`, label));
    } else if (outcome === 'passed on retry') {
      retried.push(label);
      const note = `${label}: the first run failed (first-failure/ in the shard's artifact)`;
      console.log(
        annotation('warning', `Maestro flow passed on retry (${options.platform})`, note),
      );
    }
    if (options.platform === 'ios') {
      recordFlowUiQa(uiQa, flow, (appId) => pullUiQaLog(options.device, appId));
    } else {
      uiQa.set(label, scanUiQa(adb(options.device, ['logcat', '-d', '-s', 'ReactNativeJS:V'])));
      recordFlowMeasurements(options.out, slug, (args) => adb(options.device, args));
      saveHierarchy(MAESTRO, options.device, path.join(options.out, 'hierarchy', `${slug}.json`));
    }
    summary(`| ${RESULT_CELL[outcome]} | \`${label}\` | ${String(seconds)}s |`);
    // With --test-output-dir, `takeScreenshot` writes to its `screenshots/` folder; Maestro's own
    // `screenshot-❌-…` failure images are left out.
    const taken = path.join(options.out, 'maestro', slug, 'screenshots');
    mkdirSync(taken, { recursive: true });
    const written = flowScreenshotNames(flow, taken).filter((name) => !isMaestroFailureShot(name));
    // A sweep scene that never drew leaves the screen it had instead: evidence, not a screenshot.
    for (const name of written.filter(isNotCaptured)) {
      mkdirSync(path.join(options.out, 'failures'), { recursive: true });
      const from = path.join(taken, `${name}.png`);
      if (existsSync(from)) copyFileSync(from, path.join(options.out, 'failures', `${name}.png`));
    }
    return { flow, dir: taken, names: written.filter((name) => !isNotCaptured(name)) };
  });
  for (const { from, to } of planCopies(results, shots)) {
    if (existsSync(from)) copyFileSync(from, to);
  }
  return { failed, retried, uiQa };
}

function summary(line: string): void {
  const file = process.env.GITHUB_STEP_SUMMARY;
  if (file) appendFileSync(file, `${line}\n`);
}

function main(): void {
  const options = parseShardArgs(process.argv.slice(2), process.cwd());
  summary(`### ${options.platform} shard\n\n| result | flow | time |\n| --- | --- | --- |`);
  const stopActions = startRunnerActions(options.platform, options.device);
  let shard: ReturnType<typeof runShard>;
  try {
    shard = runShard(options);
  } finally {
    stopActions();
  }
  const { failed, retried, uiQa } = shard;
  if (retried.length > 0) console.log(`Passed on retry: ${retried.join(', ')}`);
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
  const shots = scanScreenshots(path.join(options.out, 'screenshots'), appBackground());
  for (const [shot, findings] of shots) {
    for (const finding of findings)
      console.log(
        annotation('error', `screen check ${finding.code}`, `${shot}: ${finding.detail}`),
      );
  }
  const findings = writeFindings(shots, options.out);
  if (findings) {
    console.error(`Screen checks failed:\n${findings}`);
    summary(`\nScreen checks (\`${SCREEN_CHECKS_LOG}\`):\n\n\`\`\`\n${findings}\n\`\`\``);
    process.exitCode = 1;
  } else {
    console.log('screen checks: no findings');
  }
  const { red, tolerated } = shardFailures(failed); // a failed sweep seed flow costs shots only
  if (tolerated.length > 0) console.log(`Not captured, sweep flow failed: ${tolerated.join(', ')}`);
  if (red.length > 0) {
    console.error(`Maestro flow(s) failed or timed out: ${red.join(', ')}`);
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
