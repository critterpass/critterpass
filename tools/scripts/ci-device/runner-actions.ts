/**
 * Device actions a Maestro flow asks the runner for mid-flow: deliver a push notification fixture
 * or cut the network. A flow can't run a shell command, but its scripts can make HTTP requests, so
 * each device shard serves these on localhost while its flows run:
 *
 *   - evalScript: "${http.post('http://127.0.0.1:7788/push?fixture=e2e/notifications/fixtures/android-crew-chat.json', { body: '{}' }).status}"
 *   - evalScript: "${http.post('http://127.0.0.1:7788/network?state=off', { body: '{}' }).status}"
 *   - evalScript: "${http.post('http://127.0.0.1:7788/type', { body: 'SQ 938' }).status}"
 *
 * `/push` reads the fixture (repo-root-relative JSON), fills its `${NAME}` placeholders from the
 * runner's environment (CREW_ID, CREW_NAME) and delivers it: `xcrun simctl push` on iOS, the FCM
 * receive broadcast (as root) on an Android emulator. `/network` turns Wi-Fi and mobile data off or
 * on (Android; iOS simulators share the Mac's network, so it answers 501). `/type` types its body into the
 * focused field with `input text` (Android; iOS answers 501): Maestro's own inputText waits for the
 * screen to settle after every character, which a field that re-renders on each key turns into
 * minutes. It types in short chunks with a pause after each: a field that handles every key slowly
 * falls behind one long `input text`, and Android drops the key events still queued past its input
 * dispatch timeout, which cut the text off mid-word. `/type` answers 202 at once and types in the
 * background (the whole text takes longer than a flow script's request may wait); the flow then
 * waits for the text's end to show. `/keyboard?state=off|on` disables the soft keyboard (the default
 * input method) and brings it back (Android): typed keys still reach the focused field, and no
 * keyboard panel is left covering the screen's buttons. The other actions answer 200 when done.
 * `/pasteboard`, `/fresh-launch`, `/location` and `/scenario` (other people driven through the api) live in
 * ./runner-scenarios.
 *
 *   tsx tools/scripts/ci-device/runner-actions.ts --platform android --device <serial> [--port 7788]
 */
import { spawnSync, type spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseArgs } from 'node:util';

import type { DevicePlatform } from './plan-shards';
import { location, pasteboard, scenario, scenarioOutput, stopScenarios } from './runner-scenarios';

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..');
export const RUNNER_ACTIONS_PORT = 7788;
export const APP_ID = 'app.critterpass.dev';
const FCM_RECEIVER = `${APP_ID}/com.google.firebase.iid.FirebaseInstanceIdReceiver`;

/** Fills `${NAME}` placeholders from `env`; a placeholder with no value is an error. */
export function fillPlaceholders(text: string, env: NodeJS.ProcessEnv): string {
  return text.replace(/\$\{([A-Z0-9_]+)\}/g, (_, name: string) => {
    const value = env[name];
    if (value === undefined || value === '') throw new Error(`${name} is not set on the runner`);
    return value;
  });
}

/** `am broadcast` arguments that hand an FCM data message (flat string map) to the app. */
export function fcmBroadcastArgs(data: Readonly<Record<string, unknown>>): string[] {
  const extras = Object.entries(data).flatMap(([key, value]) => [
    '--es',
    key,
    typeof value === 'string' ? value : JSON.stringify(value),
  ]);
  return [
    'am',
    'broadcast',
    '-a',
    'com.google.android.c2dm.intent.RECEIVE',
    '-n',
    FCM_RECEIVER,
    ...extras,
  ];
}

/** Shell-quotes one argument for `adb shell`, which runs its arguments through the device's sh. */
function quote(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

export type Run = (command: string, args: string[]) => { status: number | null; output: string };

const run: Run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}` };
};

export interface ActionContext {
  readonly platform: DevicePlatform;
  readonly device: string;
  readonly root: string;
  readonly env: NodeJS.ProcessEnv;
  readonly run: Run;
  /** Waits between typed chunks; defaults to a real timer. */
  readonly sleep?: (ms: number) => Promise<void>;
  readonly log?: (line: string) => void;
  /** Starts a scenario script (./runner-scenarios); defaults to node's spawn. */
  readonly spawn?: typeof spawn;
}

export interface ActionResult {
  readonly status: number;
  readonly message: string;
}

function push(fixture: string, ctx: ActionContext): ActionResult {
  const file = path.resolve(ctx.root, fixture);
  if (!file.startsWith(`${ctx.root}${path.sep}`)) return { status: 400, message: 'bad fixture' };
  const text = fillPlaceholders(readFileSync(file, 'utf8'), ctx.env);
  if (ctx.platform === 'ios') {
    const payload = path.join(mkdtempSync(path.join(tmpdir(), 'push-')), 'payload.json');
    writeFileSync(payload, text);
    const result = ctx.run('xcrun', ['simctl', 'push', ctx.device, APP_ID, payload]);
    return result.status === 0
      ? { status: 200, message: `pushed ${fixture}` }
      : { status: 500, message: result.output };
  }
  ctx.run('adb', ['-s', ctx.device, 'root']);
  ctx.run('adb', ['-s', ctx.device, 'wait-for-device']);
  const data = JSON.parse(text) as Record<string, unknown>;
  const args = fcmBroadcastArgs(data).map(quote).join(' ');
  const result = ctx.run('adb', ['-s', ctx.device, 'shell', args]);
  return result.status === 0 && /result=-1|Broadcast completed/.test(result.output)
    ? { status: 200, message: `delivered ${fixture}` }
    : { status: 500, message: result.output };
}

function network(state: string, ctx: ActionContext): ActionResult {
  if (state !== 'on' && state !== 'off') return { status: 400, message: 'state: on or off' };
  if (ctx.platform === 'ios')
    return { status: 501, message: 'a simulator shares the Mac network; cut it on the host' };
  const verb = state === 'on' ? 'enable' : 'disable';
  for (const radio of ['wifi', 'data'])
    ctx.run('adb', ['-s', ctx.device, 'shell', 'svc', radio, verb]);
  return { status: 200, message: `network ${state}` };
}

/** `input text` argument: spaces as `%s`, the rest quoted for the device's shell. */
export function inputTextArg(text: string): string {
  return quote(text.replace(/%/g, '\\%').replace(/ /g, '%s'));
}

let disabledInputMethod: string | undefined;

function keyboard(state: string, ctx: ActionContext): ActionResult {
  if (state !== 'on' && state !== 'off') return { status: 400, message: 'state: on or off' };
  if (ctx.platform === 'ios') return { status: 501, message: 'Android only' };
  const adb = (...args: string[]) => ctx.run('adb', ['-s', ctx.device, 'shell', ...args]);
  if (state === 'off') {
    const current = adb('settings', 'get', 'secure', 'default_input_method').output.trim();
    if (current === '' || current === 'null')
      return { status: 200, message: 'no keyboard to hide' };
    const result = adb('ime', 'disable', current);
    if (result.status !== 0) return { status: 500, message: result.output };
    disabledInputMethod = current;
    return { status: 200, message: `keyboard off (${current})` };
  }
  if (disabledInputMethod === undefined) return { status: 200, message: 'keyboard already on' };
  adb('ime', 'enable', disabledInputMethod);
  const result = adb('ime', 'set', disabledInputMethod);
  if (result.status !== 0) return { status: 500, message: result.output };
  disabledInputMethod = undefined;
  return { status: 200, message: 'keyboard on' };
}

/** Characters per `input text` call, and the pause that lets the field catch up after each. */
export const TYPE_CHUNK_LENGTH = 8;
export const TYPE_CHUNK_PAUSE_MS = 1500;

export function typeChunks(text: string, size = TYPE_CHUNK_LENGTH): string[] {
  const chunks: string[] = [];
  for (let start = 0; start < text.length; start += size)
    chunks.push(text.slice(start, start + size));
  return chunks;
}

const timerSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Types `text` chunk by chunk into the focused field; resolves with the outcome. */
export async function typeText(text: string, ctx: ActionContext): Promise<ActionResult> {
  const sleep = ctx.sleep ?? timerSleep;
  const chunks = typeChunks(text);
  for (const chunk of chunks) {
    const result = ctx.run('adb', ['-s', ctx.device, 'shell', `input text ${inputTextArg(chunk)}`]);
    if (result.status !== 0) return { status: 500, message: result.output };
    await sleep(TYPE_CHUNK_PAUSE_MS);
  }
  return { status: 200, message: `typed ${String(text.length)} characters` };
}

function type(text: string, ctx: ActionContext): ActionResult {
  if (text === '') return { status: 400, message: 'text is required' };
  if (ctx.platform === 'ios') return { status: 501, message: 'type with inputText on iOS' };
  const log = ctx.log ?? console.log;
  void typeText(text, ctx).then(
    (result) => log(`runner action /type: ${String(result.status)} ${result.message}`),
    (error: unknown) => log(`runner action /type failed: ${String(error)}`),
  );
  return {
    status: 202,
    message: `typing ${String(text.length)} characters in ${String(typeChunks(text).length)} chunks`,
  };
}

/** Routes one request (`/push`, `/network`, `/type`, `/keyboard`, and ./runner-scenarios' own) to its action. */
export function handleAction(url: string, ctx: ActionContext, body = ''): ActionResult {
  const { pathname, searchParams } = new URL(url, 'http://127.0.0.1');
  try {
    if (pathname === '/push') return push(searchParams.get('fixture') ?? '', ctx);
    if (pathname === '/network') return network(searchParams.get('state') ?? '', ctx);
    if (pathname === '/type') return type(body, ctx);
    if (pathname === '/keyboard') return keyboard(searchParams.get('state') ?? '', ctx);
    if (pathname === '/pasteboard') return pasteboard(body, ctx);
    if (pathname === '/location') return location(searchParams, ctx);
    if (pathname === '/fresh-launch') return freshLaunch(searchParams, ctx);
    if (pathname === '/scenario') return scenario(searchParams, ctx);
    if (pathname === '/scenario-output') return scenarioOutput(searchParams);
    return { status: 404, message: `no action ${pathname}` };
  } catch (error) {
    return { status: 500, message: error instanceof Error ? error.message : String(error) };
  }
}

function main(): void {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: {
      platform: { type: 'string' },
      device: { type: 'string' },
      port: { type: 'string', default: String(RUNNER_ACTIONS_PORT) },
    },
  });
  const { platform, device } = values;
  if (platform !== 'ios' && platform !== 'android') throw new Error('--platform: ios or android');
  if (!device) throw new Error('--device is required');
  const ctx: ActionContext = { platform, device, root: REPO_ROOT, env: process.env, run };
  createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on('data', (chunk: Buffer) => chunks.push(chunk));
    request.on('end', () => {
      const body = Buffer.concat(chunks).toString('utf8');
      const result = handleAction(request.url ?? '/', ctx, body);
      console.log(`runner action ${request.url ?? ''}: ${String(result.status)} ${result.message}`);
      response.writeHead(result.status, { 'content-type': 'text/plain' }).end(result.message);
    });
  }).listen(Number(values.port), '127.0.0.1', () => {
    process.once('SIGTERM', () => {
      stopScenarios();
      process.exit(0);
    });
    console.log(`Runner actions on 127.0.0.1:${values.port}`);
  });
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
