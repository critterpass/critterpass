import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { afterEach, describe, expect, it } from 'vitest';

import { handleAction, type ActionContext, type Run } from './runner-actions';
import { stopScenarios } from './runner-scenarios';

class FakeChild extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  killed = false;
  kill(): boolean {
    this.killed = true;
    return true;
  }
}

function setup(platform: 'ios' | 'android', env: NodeJS.ProcessEnv = {}) {
  const calls: { command: string; args: string[] }[] = [];
  const spawned: { args: readonly string[]; child: FakeChild }[] = [];
  const run: Run = (command, args) => {
    calls.push({ command, args });
    return { status: 0, output: '' };
  };
  const ctx: ActionContext = {
    platform,
    device: platform === 'ios' ? 'SIM-UDID' : 'emulator-5554',
    root: '/repo',
    env: { E2E_API_BASE_URL: 'https://api.example', ...env },
    run,
    log: () => undefined,
    spawn: ((_command: string, args: readonly string[]) => {
      const child = new FakeChild();
      spawned.push({ args, child });
      return child;
    }) as unknown as NonNullable<ActionContext['spawn']>,
  };
  return { ctx, calls, spawned };
}

const flush = () => new Promise((resolve) => setImmediate(resolve));

afterEach(() => stopScenarios());

describe('runner scenarios', () => {
  it('puts text on the simulator pasteboard and refuses on Android', () => {
    const ios = setup('ios');
    expect(handleAction('/pasteboard', ios.ctx, 'https://x.test/i/K7M2QX').status).toBe(200);
    expect(ios.calls[0]?.args.slice(-2)).toEqual(['https://x.test/i/K7M2QX', 'SIM-UDID']);
    expect(handleAction('/pasteboard', setup('android').ctx, 'x').status).toBe(501);
    expect(handleAction('/pasteboard', ios.ctx, '').status).toBe(400);
  });

  it('wipes the app and starts it with the referrer as a launch extra', () => {
    const android = setup('android');
    const resolved: Run = (command, args) => {
      android.calls.push({ command, args });
      return {
        status: 0,
        output: args.includes('resolve-activity') ? 'priority=0\napp/.Main' : '',
      };
    };
    const ctx = { ...android.ctx, run: resolved };
    expect(handleAction("/fresh-launch?referrer=cp_link%3D%2Fi%2FK7M'2QX", ctx).status).toBe(200);
    expect(android.calls[0]?.args).toEqual([
      '-s',
      'emulator-5554',
      'shell',
      'pm',
      'clear',
      'app.critterpass.dev',
    ]);
    expect(android.calls[2]?.args.at(-1)).toBe(
      "am start -W -n app/.Main -a android.intent.action.MAIN -c android.intent.category.LAUNCHER --es cp_install_referrer 'cp_link=/i/K7M'\\''2QX'",
    );
    expect(handleAction('/fresh-launch?referrer=x', setup('ios').ctx).status).toBe(501);
  });

  it('moves the device: lat,lng for simctl, lng lat for the emulator console', () => {
    const ios = setup('ios');
    handleAction('/location?lat=-8.5058&lng=115.2569', ios.ctx);
    expect(ios.calls[0]?.args).toEqual([
      'simctl',
      'location',
      'SIM-UDID',
      'set',
      '-8.5058,115.2569',
    ]);
    const android = setup('android');
    handleAction('/location?lat=-8.5058&lng=115.2569', android.ctx);
    expect(android.calls[0]?.args).toEqual([
      '-s',
      'emulator-5554',
      'emu',
      'geo',
      'fix',
      '115.2569',
      '-8.5058',
    ]);
    expect(handleAction('/location?lat=91&lng=0', ios.ctx).status).toBe(400);
  });

  it('starts a scenario against the api and reports ready once it prints its JSON line', async () => {
    const { ctx, spawned } = setup('android');
    expect(handleAction('/scenario-output?name=trip-day', ctx).status).toBe(404);
    expect(handleAction('/scenario?name=trip-day&code=K7M2QX', ctx).status).toBe(202);
    const started = spawned[0];
    expect(started?.args.slice(-8)).toEqual([
      '--api',
      'https://api.example',
      '--code',
      'K7M2QX',
      '--members',
      '5',
      '--up',
      '0',
    ]);
    expect(handleAction('/scenario-output?name=trip-day', ctx).status).toBe(202);
    started?.child.stdout.write('joining\n{"crew_code":"K7M2QX","members":[]}\n');
    await flush();
    expect(handleAction('/scenario-output?name=trip-day', ctx)).toEqual({
      status: 200,
      message: '{"crew_code":"K7M2QX","members":[]}',
    });
  });

  it('starts the friend of a crew with the action asked for, the next call replacing the last', () => {
    const { ctx, spawned } = setup('android');
    expect(handleAction('/scenario?name=friend&code=K7M2QX&action=join', ctx).status).toBe(202);
    expect(spawned[0]?.args.at(-7)).toMatch(/ci-device\/scenario-friend\.ts$/);
    expect(spawned[0]?.args.slice(-4)).toEqual(['--code', 'K7M2QX', '--action', 'join']);
    expect(handleAction('/scenario?name=friend&code=K7M2QX&action=board', ctx).status).toBe(202);
    expect(spawned[0]?.child.killed).toBe(true);
    expect(spawned[1]?.args.slice(-2)).toEqual(['--action', 'board']);
    // Without an action there is nothing to do.
    expect(handleAction('/scenario?name=friend&code=K7M2QX', ctx).status).toBe(500);
  });

  it('reports a scenario that exits before it is set up, and refuses bad requests', () => {
    const { ctx, spawned } = setup('ios');
    handleAction('/scenario?name=live-map&code=K7M2QX&trip=t1&poi=p1', ctx);
    spawned[0]?.child.emit('exit', 1);
    expect(handleAction('/scenario-output?name=live-map', ctx).status).toBe(500);
    expect(handleAction('/scenario?name=nope', ctx).status).toBe(400);
    expect(handleAction('/scenario?name=trip-day', ctx).status).toBe(500);
    expect(
      handleAction('/scenario?name=trip-day&code=x', setup('ios', { E2E_API_BASE_URL: '' }).ctx)
        .status,
    ).toBe(500);
  });
});
