/**
 * Proves, before a shard's first flow, that the device can resolve and reach the api the build
 * talks to. An emulator that has lost its network otherwise costs every flow its full wait on data
 * that can never arrive.
 *
 *   tsx tools/scripts/ci-device/network-preflight.ts --platform android --device <serial> --url <api base url>
 *
 * Android: the name is resolved and a connection opened from inside the emulator (`ping` for the
 * lookup, `curl` or `nc` for the connection, whichever the image has). When that fails, Wi-Fi and
 * mobile data are turned off and on once and the check repeats; a second failure ends the shard
 * with one error line. iOS: a simulator uses the Mac's network, so the runner itself makes the
 * request, and waits once before trying again.
 *
 * Only positive evidence fails a shard (the name does not resolve, the connection is refused or
 * times out). A check the device image cannot make is reported and passes.
 */
import { spawnSync } from 'node:child_process';
import { appendFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

import type { DevicePlatform } from './plan-shards';

export interface ApiTarget {
  readonly url: string;
  readonly host: string;
  readonly port: number;
}

/** The host and port a base url names; throws on anything that is not a plain http(s) url. */
export function apiTarget(baseUrl: string): ApiTarget {
  const url = new URL(baseUrl.trim());
  if (url.protocol !== 'https:' && url.protocol !== 'http:')
    throw new Error(`Not an http(s) url: ${baseUrl}`);
  if (!/^[\w.-]+$/.test(url.hostname)) throw new Error(`Unexpected host in ${baseUrl}`);
  const port = url.port ? Number(url.port) : url.protocol === 'https:' ? 443 : 80;
  return { url: url.origin, host: url.hostname, port };
}

/** `reached` and `failed` are evidence; `unknown` means this check could not tell. */
export type Verdict =
  | { readonly state: 'reached'; readonly detail: string }
  | { readonly state: 'failed'; readonly reason: string }
  | { readonly state: 'unknown'; readonly detail: string };

export interface CommandResult {
  readonly status: number | null;
  readonly output: string;
}

const LOOKUP_FAILED = /unknown host|bad address|not known|no address associated/i;

/** What `ping -c 1 <host>` says about the lookup; whether the echo came back does not matter. */
export function lookupVerdict(host: string, ping: CommandResult): Verdict {
  if (LOOKUP_FAILED.test(ping.output)) return { state: 'failed', reason: `cannot resolve ${host}` };
  const address = /^PING \S+ \(([0-9a-f.:]+)\)/im.exec(ping.output)?.[1];
  return address
    ? { state: 'reached', detail: `${host} resolves to ${address}` }
    : { state: 'unknown', detail: 'ping gave no lookup result' };
}

/** curl's exit status: 6 no lookup, 7 no connection, 28 timed out; 0 is any HTTP answer. */
export function curlVerdict(target: ApiTarget, curl: CommandResult): Verdict {
  const said = curl.output.trim().split('\n').pop() ?? '';
  if (curl.status === 0) return { state: 'reached', detail: `${target.url} answered HTTP ${said}` };
  if (curl.status === 6) return { state: 'failed', reason: `cannot resolve ${target.host}` };
  if (curl.status === 7) return { state: 'failed', reason: `cannot connect to ${target.host}` };
  if (curl.status === 28)
    return { state: 'failed', reason: `no answer from ${target.host} in time` };
  return { state: 'unknown', detail: `curl exit ${String(curl.status)}: ${said}` };
}

const CONNECT_FAILED = /unknown host|refused|timed out|timeout|unreachable|no route/i;

export function netcatVerdict(target: ApiTarget, nc: CommandResult): Verdict {
  const where = `${target.host}:${String(target.port)}`;
  if (nc.status === 0) return { state: 'reached', detail: `connected to ${where}` };
  if (CONNECT_FAILED.test(nc.output))
    return { state: 'failed', reason: `cannot connect to ${where} (${nc.output.trim()})` };
  return { state: 'unknown', detail: `nc exit ${String(nc.status)}` };
}

/** Runs one shell command on the device (or the runner) and returns its status and output. */
export type Shell = (command: string) => CommandResult;

/** One check from inside an Android device: the lookup first, then a connection. */
export function androidProbe(target: ApiTarget, shell: Shell): Verdict {
  const lookup = lookupVerdict(target.host, shell(`ping -c 1 -W 3 ${target.host}`));
  if (lookup.state === 'failed') return lookup;
  const where = `${target.host} ${String(target.port)}`;
  const connect =
    shell('command -v curl').status === 0
      ? curlVerdict(target, shell(`curl -ksS -m 15 -o /dev/null -w '%{http_code}' ${target.url}`))
      : shell('command -v nc').status === 0
        ? netcatVerdict(target, shell(`nc -w 10 ${where} </dev/null`))
        : ({ state: 'unknown', detail: 'the device has neither curl nor nc' } as const);
  // A lookup that worked is evidence enough when the connection could not be tested.
  return connect.state === 'unknown' && lookup.state === 'reached' ? lookup : connect;
}

export interface PreflightSteps {
  readonly probe: () => Verdict;
  /** Brings the device's network back up (Android), or just waits (iOS). */
  readonly restartNetwork: () => void;
  readonly pause: (ms: number) => void;
  readonly log: (line: string) => void;
}

export interface PreflightResult {
  readonly ok: boolean;
  readonly restarted: boolean;
  readonly line: string;
}

/** Probes before the network is restarted, and again after: about half a minute each time. */
export const PROBE_TRIES = 6;
const PAUSE_MS = 5000;

/** Probes until an answer other than `failed`, a few times: a network that just came up is slow. */
function settle(steps: PreflightSteps): Verdict {
  let verdict = steps.probe();
  for (let attempt = 1; attempt < PROBE_TRIES && verdict.state === 'failed'; attempt += 1) {
    steps.log(`network pre-flight: ${verdict.reason}; trying again`);
    steps.pause(PAUSE_MS);
    verdict = steps.probe();
  }
  return verdict;
}

/** The whole decision: check, restart the network once if the check failed, check again. */
export function preflight(steps: PreflightSteps): PreflightResult {
  const first = settle(steps);
  if (first.state !== 'failed') return { ok: true, restarted: false, line: first.detail };
  steps.log(`network pre-flight: ${first.reason}; restarting the device's network once`);
  steps.restartNetwork();
  const second = settle(steps);
  if (second.state !== 'failed')
    return { ok: true, restarted: true, line: `${second.detail} (after a network restart)` };
  return { ok: false, restarted: true, line: `${second.reason}, also after a network restart` };
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function run(command: string, args: string[]): CommandResult {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 40_000 });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
}

function deviceSteps(platform: DevicePlatform, device: string, target: ApiTarget): PreflightSteps {
  const log = (line: string) => {
    console.log(line);
  };
  if (platform === 'ios') {
    const curl = ['-ksS', '-m', '15', '-o', '/dev/null', '-w', '%{http_code}', target.url];
    return {
      probe: () => curlVerdict(target, run('curl', curl)),
      restartNetwork: () => {
        sleep(15_000);
      },
      pause: sleep,
      log,
    };
  }
  const shell: Shell = (command) => run('adb', ['-s', device, 'shell', command]);
  return {
    probe: () => androidProbe(target, shell),
    restartNetwork: () => {
      for (const radio of ['wifi', 'data']) shell(`svc ${radio} disable`);
      sleep(3000);
      for (const radio of ['wifi', 'data']) shell(`svc ${radio} enable`);
      sleep(10_000);
    },
    pause: sleep,
    log,
  };
}

function main(): void {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: {
      platform: { type: 'string' },
      device: { type: 'string' },
      url: { type: 'string', default: '' },
    },
  });
  const { platform, device, url } = values;
  if (platform !== 'ios' && platform !== 'android') throw new Error('--platform: ios or android');
  if (!device) throw new Error('--device is required');
  if (!url.trim()) {
    console.log('network pre-flight: no api url given, nothing to check');
    return;
  }
  const target = apiTarget(url);
  const result = preflight(deviceSteps(platform, device, target));
  const summary = process.env.GITHUB_STEP_SUMMARY;
  if (result.ok) {
    console.log(`network pre-flight: ${result.line}`);
    if (result.restarted && summary)
      appendFileSync(summary, `Network pre-flight (${platform}): ${result.line}\n\n`);
    return;
  }
  const line = `The ${platform === 'ios' ? 'simulator' : 'emulator'} has no network: ${result.line}. No flow was run.`;
  console.log(`::error title=Device cannot reach the api (${platform})::${line}`);
  if (summary) appendFileSync(summary, `**${line}**\n\n`);
  process.exitCode = 1;
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
