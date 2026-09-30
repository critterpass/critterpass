import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  fcmBroadcastArgs,
  fillPlaceholders,
  handleAction,
  TYPE_CHUNK_PAUSE_MS,
  typeChunks,
  typeText,
  type Run,
} from './runner-actions';

function setup() {
  const root = mkdtempSync(path.join(tmpdir(), 'runner-actions-'));
  mkdirSync(path.join(root, 'fixtures'));
  writeFileSync(
    path.join(root, 'fixtures/chat.json'),
    JSON.stringify({ title: 'Mai · ${CREW_NAME}', thread_id: '${CREW_ID}', body: "who's in?" }),
  );
  const calls: { command: string; args: string[]; payload?: string }[] = [];
  const run: Run = (command, args) => {
    const payload = args.find((arg) => arg.endsWith('.json'));
    calls.push({ command, args, ...(payload ? { payload: readFileSync(payload, 'utf8') } : {}) });
    return { status: 0, output: 'Broadcast completed: result=-1' };
  };
  const env = { CREW_ID: 'c1', CREW_NAME: 'Bali Six' };
  return { root, calls, run, env };
}

describe('runner actions', () => {
  it('fills placeholders and refuses a missing value', () => {
    expect(fillPlaceholders('${A}-${B}', { A: '1', B: '2' })).toBe('1-2');
    expect(() => fillPlaceholders('${CREW_ID}', {})).toThrow('CREW_ID is not set');
  });

  it('builds the FCM receive broadcast with one string extra per key', () => {
    expect(fcmBroadcastArgs({ type: 'crew_chat', v: 1 })).toEqual([
      'am',
      'broadcast',
      '-a',
      'com.google.android.c2dm.intent.RECEIVE',
      '-n',
      'app.critterpass.dev/com.google.firebase.iid.FirebaseInstanceIdReceiver',
      '--es',
      'type',
      'crew_chat',
      '--es',
      'v',
      '1',
    ]);
  });

  it('pushes a filled fixture to an iOS simulator', () => {
    const { root, calls, run, env } = setup();
    const ctx = { platform: 'ios' as const, device: 'UDID', root, env, run };
    expect(handleAction('/push?fixture=fixtures/chat.json', ctx).status).toBe(200);
    expect(calls[0]?.args.slice(0, 4)).toEqual(['simctl', 'push', 'UDID', 'app.critterpass.dev']);
    expect(JSON.parse(calls[0]?.payload ?? '{}')).toMatchObject({ title: 'Mai · Bali Six' });
  });

  it('delivers a fixture on Android as root and turns the network off', () => {
    const { root, calls, run, env } = setup();
    const ctx = { platform: 'android' as const, device: 'emulator-5554', root, env, run };
    expect(handleAction('/push?fixture=fixtures/chat.json', ctx).status).toBe(200);
    expect(calls[0]?.args).toEqual(['-s', 'emulator-5554', 'root']);
    expect(calls.at(-1)?.args.at(-1)).toContain("'--es' 'thread_id' 'c1'");
    expect(handleAction('/network?state=off', ctx).status).toBe(200);
    expect(calls.at(-1)?.args).toEqual(['-s', 'emulator-5554', 'shell', 'svc', 'data', 'disable']);
  });

  it('types text into the focused field on Android in short chunks with pauses', async () => {
    const { root, calls, run, env } = setup();
    const pauses: number[] = [];
    const ctx = {
      platform: 'android' as const,
      device: 'emulator-5554',
      root,
      env,
      run,
      sleep: (ms: number) => {
        pauses.push(ms);
        return Promise.resolve();
      },
    };
    const text = "SQ 938 on 2026-10-21, Winston's seat";
    expect(await typeText(text, ctx)).toMatchObject({ status: 200 });
    expect(calls.map((call) => call.args.at(-1))).toEqual([
      `input text 'SQ%s938%so'`,
      `input text 'n%s2026-1'`,
      `input text '0-21,%sWi'`,
      `input text 'nston'\\''s%s'`,
      `input text 'seat'`,
    ]);
    expect(pauses).toEqual(Array(5).fill(TYPE_CHUNK_PAUSE_MS));
    expect(typeChunks(text).join('')).toBe(text);
    expect(handleAction('/type', { ...ctx, log: () => undefined }, text).status).toBe(202);
    expect(handleAction('/type', ctx).status).toBe(400);
    expect(handleAction('/type', { ...ctx, platform: 'ios' }, 'x').status).toBe(501);
  });

  it('turns the soft keyboard off and back on on Android', () => {
    const { root, calls, env } = setup();
    const run: Run = (command, args) => {
      calls.push({ command, args });
      return {
        status: 0,
        output: args.includes('default_input_method') ? 'com.example/.Ime\n' : '',
      };
    };
    const ctx = { platform: 'android' as const, device: 'emulator-5554', root, env, run };
    expect(handleAction('/keyboard?state=off', ctx).status).toBe(200);
    expect(calls.at(-1)?.args).toEqual([
      '-s',
      'emulator-5554',
      'shell',
      'ime',
      'disable',
      'com.example/.Ime',
    ]);
    expect(handleAction('/keyboard?state=on', ctx).status).toBe(200);
    expect(calls.slice(-2).map((call) => call.args.slice(3))).toEqual([
      ['ime', 'enable', 'com.example/.Ime'],
      ['ime', 'set', 'com.example/.Ime'],
    ]);
    expect(handleAction('/keyboard?state=up', ctx).status).toBe(400);
    expect(handleAction('/keyboard?state=off', { ...ctx, platform: 'ios' }).status).toBe(501);
  });

  it('answers what it cannot do', () => {
    const { root, run, env } = setup();
    const ios = { platform: 'ios' as const, device: 'UDID', root, env, run };
    expect(handleAction('/network?state=off', ios).status).toBe(501);
    expect(handleAction('/push?fixture=../../etc/passwd', ios).status).toBe(400);
    expect(handleAction('/nope', ios).status).toBe(404);
    expect(handleAction('/push?fixture=fixtures/chat.json', { ...ios, env: {} }).status).toBe(500);
  });
});
