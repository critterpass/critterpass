/**
 * The App Group outbox after the lock-screen buttons of the newer activities were tapped on top
 * of a file an older build wrote (targets/widgets/Tests/Fixtures/lock-screen-pending-actions.json,
 * which the Swift host test proves the writers produce): the app's drain reads every entry, the
 * older build's string-only I'M UP included, and each payload is one its command accepts.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from '@jest/globals';

import {
  castBallotPayloadSchema,
  checkPackingItemPayloadSchema,
  pingAllPayloadSchema,
  readPendingActions,
  reportRunningLatePayloadSchema,
  respondSosPayloadSchema,
  sendNudgePayloadSchema,
  setReadinessPayloadSchema,
  triggerSosPayloadSchema,
} from '@cp/domain';

const FIXTURES = path.resolve(__dirname, '../../../../../targets/widgets/Tests/Fixtures');
const read = (name: string) => readFileSync(path.join(FIXTURES, name), 'utf8');

const PAYLOADS = {
  set_readiness: setReadinessPayloadSchema,
  report_running_late: reportRunningLatePayloadSchema,
  ping_all: pingAllPayloadSchema,
  trigger_sos: triggerSosPayloadSchema,
  respond_sos: respondSosPayloadSchema,
  cast_ballot: castBallotPayloadSchema,
  send_nudge: sendNudgePayloadSchema,
  check_packing_item: checkPackingItemPayloadSchema,
} as const;

describe('what the lock-screen buttons queue', () => {
  const drained = readPendingActions(read('lock-screen-pending-actions.json'));

  it('is read whole by the drain, in the order it was tapped', () => {
    expect(drained.kind).toBe('ok');
    if (drained.kind !== 'ok') return;
    expect(drained.invalid).toEqual([]);
    expect(drained.actions.map((action) => [action.cmd, action.via])).toEqual([
      ['set_readiness', 'la_intent'],
      ['report_running_late', 'la_intent'],
      ['ping_all', 'la_intent'],
      ['ping_all', 'la_intent'],
      ['trigger_sos', 'la_intent'],
      ['respond_sos', 'la_intent'],
      ['cast_ballot', 'la_intent'],
      ['cast_ballot', 'widget'],
      ['send_nudge', 'widget'],
      ['check_packing_item', 'widget'],
    ]);
  });

  it('keeps the entry an older build queued exactly as that build wrote it', () => {
    const older = readPendingActions(read('im-up-pending-actions.json'));
    if (drained.kind !== 'ok' || older.kind !== 'ok') throw new Error('unreadable fixture');
    expect(drained.actions[0]).toEqual(older.actions[0]);
  });

  it('carries payloads their commands accept', () => {
    if (drained.kind !== 'ok') throw new Error('unreadable fixture');
    for (const action of drained.actions) {
      const schema = PAYLOADS[action.cmd as keyof typeof PAYLOADS];
      expect({ cmd: action.cmd, ok: schema.safeParse(action.payload).success }).toEqual({
        cmd: action.cmd,
        ok: true,
      });
    }
    expect(drained.actions[1]?.payload).toMatchObject({ minutes: 10 });
  });
});
