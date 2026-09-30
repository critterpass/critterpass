import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { fcmBroadcastArgs, fillPlaceholders, handleAction, type Run } from './runner-actions';

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

  it('types text into the focused field on Android', () => {
    const { root, calls, run, env } = setup();
    const ctx = { platform: 'android' as const, device: 'emulator-5554', root, env, run };
    expect(handleAction('/type', ctx, "SQ 938 on 2026-10-21, Winston's seat").status).toBe(200);
    expect(calls.at(-1)?.args).toEqual([
      '-s',
      'emulator-5554',
      'shell',
      `input text 'SQ%s938%son%s2026-10-21,%sWinston'\\''s%sseat'`,
    ]);
    expect(handleAction('/type', ctx).status).toBe(400);
    expect(handleAction('/type', { ...ctx, platform: 'ios' }, 'x').status).toBe(501);
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
