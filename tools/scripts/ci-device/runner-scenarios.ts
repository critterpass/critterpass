/**
 * Runner actions that set up the world around the device under test (./runner-actions.ts serves
 * them on 127.0.0.1:7788):
 *
 * - `/pasteboard` (body: the text): puts text on the simulator's pasteboard (iOS; Android answers
 *   501), for the first-launch paste offer.
 * - `/fresh-launch?referrer=…`: wipes the app and starts it as a fresh install with the
 *   `cp_install_referrer` launch extra (Android; iOS answers 501). Maestro's own `launchApp`
 *   arguments are not filled from a flow's runtime values, and the referrer carries a live code.
 * - `/location?lat=…&lng=…`: moves the device (`simctl location set` on iOS, the emulator console's
 *   `geo fix` on Android).
 * - `/scenario?name=…&<args>`: starts a script that drives other people through the api of the
 *   build under test (`E2E_API_BASE_URL`): `trip-day` (../seed-trip-day.ts: five travellers join
 *   the crew behind `code`) and `live-map` (../live-map-sim/by-code.ts: crewmates join the crew behind
 *   `code` and keep walking on `trip`). It answers 202 at once; `/scenario-output?name=…` then
 *   answers 202 while the script sets up, 200 with its JSON line once it has, and 500 if it failed.
 *   A `live-map` sim keeps running (posting fixes) until the shard ends.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import path from 'node:path';

import { APP_ID, type ActionContext, type ActionResult } from './runner-actions';

const SCRIPTS_DIR = path.resolve(import.meta.dirname, '..');

interface ScenarioScript {
  readonly file: string;
  /** Script arguments from the request's query; throws on a missing one. */
  args(query: URLSearchParams): string[];
}

function required(query: URLSearchParams, key: string): string {
  const value = query.get(key);
  if (value === null || !/^[A-Za-z0-9-]{1,64}$/.test(value)) throw new Error(`${key} is required`);
  return value;
}

export const SCENARIOS: Readonly<Record<string, ScenarioScript>> = {
  'trip-day': {
    file: 'seed-trip-day.ts',
    args: (query) => ['--code', required(query, 'code'), '--members', query.get('members') ?? '5'],
  },
  'live-map': {
    file: 'live-map-sim/by-code.ts',
    args: (query) => [
      '--code',
      required(query, 'code'),
      '--trip',
      required(query, 'trip'),
      '--poi',
      required(query, 'poi'),
      '--minutes',
      '20',
    ],
  },
};

interface ScenarioState {
  status: 'running' | 'ready' | 'failed';
  output: string;
  readonly child: ChildProcess;
}

const running = new Map<string, ScenarioState>();

/** Stops every scenario still running (the shard is done). */
export function stopScenarios(): void {
  for (const state of running.values()) state.child.kill();
  running.clear();
}

export function scenario(query: URLSearchParams, ctx: ActionContext): ActionResult {
  const name = query.get('name') ?? '';
  const script = SCENARIOS[name];
  if (script === undefined) return { status: 400, message: `no scenario ${name}` };
  const api = ctx.env['E2E_API_BASE_URL'];
  if (api === undefined || api === '')
    return { status: 500, message: 'E2E_API_BASE_URL is not set' };
  const args = script.args(query);
  running.get(name)?.child.kill();
  const log = ctx.log ?? console.log;
  const child = (ctx.spawn ?? spawn)(
    process.execPath,
    [...process.execArgv, path.join(SCRIPTS_DIR, script.file), '--api', api, ...args],
    { env: ctx.env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  const state: ScenarioState = { status: 'running', output: '', child };
  running.set(name, state);
  let buffered = '';
  child.stdout?.on('data', (chunk: Buffer) => {
    buffered += chunk.toString('utf8');
    const lines = buffered.split('\n');
    buffered = lines.pop() ?? '';
    for (const line of lines) {
      log(`scenario ${name}: ${line}`);
      if (state.status === 'running' && line.startsWith('{')) {
        state.output = line;
        state.status = 'ready';
      }
    }
  });
  child.stderr?.on('data', (chunk: Buffer) => log(`scenario ${name}: ${chunk.toString('utf8')}`));
  child.on('exit', (code) => {
    if (state.status === 'running') {
      state.status = 'failed';
      state.output = `exited with ${String(code)} before it was set up`;
    }
  });
  return { status: 202, message: `scenario ${name} started` };
}

export function scenarioOutput(query: URLSearchParams): ActionResult {
  const name = query.get('name') ?? '';
  const state = running.get(name);
  if (state === undefined) return { status: 404, message: `scenario ${name} was not started` };
  if (state.status === 'running') return { status: 202, message: 'setting up' };
  return state.status === 'ready'
    ? { status: 200, message: state.output }
    : { status: 500, message: state.output };
}

export function pasteboard(text: string, ctx: ActionContext): ActionResult {
  if (text === '') return { status: 400, message: 'text is required' };
  if (ctx.platform === 'android') return { status: 501, message: 'iOS only' };
  const result = ctx.run('sh', [
    '-c',
    'printf %s "$1" | xcrun simctl pbcopy "$2"',
    'pbcopy',
    text,
    ctx.device,
  ]);
  return result.status === 0
    ? { status: 200, message: `pasteboard holds ${String(text.length)} characters` }
    : { status: 500, message: result.output };
}

export function location(query: URLSearchParams, ctx: ActionContext): ActionResult {
  const lat = Number(query.get('lat'));
  const lng = Number(query.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180)
    return { status: 400, message: 'lat and lng are required' };
  const result =
    ctx.platform === 'ios'
      ? ctx.run('xcrun', ['simctl', 'location', ctx.device, 'set', `${String(lat)},${String(lng)}`])
      : ctx.run('adb', ['-s', ctx.device, 'emu', 'geo', 'fix', String(lng), String(lat)]);
  return result.status === 0
    ? { status: 200, message: `location ${String(lat)},${String(lng)}` }
    : { status: 500, message: result.output };
}

/** `--es` value for the device's shell: single-quoted, with any single quote escaped. */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

export function freshLaunch(query: URLSearchParams, ctx: ActionContext): ActionResult {
  const referrer = query.get('referrer') ?? '';
  if (referrer === '') return { status: 400, message: 'referrer is required' };
  if (ctx.platform === 'ios') return { status: 501, message: 'Android only' };
  const adb = (...args: string[]) => ctx.run('adb', ['-s', ctx.device, 'shell', ...args]);
  const cleared = adb('pm', 'clear', APP_ID);
  if (cleared.status !== 0) return { status: 500, message: cleared.output };
  const activity = adb('cmd', 'package', 'resolve-activity', '--brief', APP_ID)
    .output.trim()
    .split('\n')
    .pop();
  if (activity === undefined || !activity.includes('/'))
    return { status: 500, message: 'no launcher activity' };
  const started = adb(
    `am start -W -n ${activity} -a android.intent.action.MAIN -c android.intent.category.LAUNCHER --es cp_install_referrer ${shellQuote(referrer)}`,
  );
  return started.status === 0
    ? { status: 200, message: `fresh launch of ${activity}` }
    : { status: 500, message: started.output };
}
