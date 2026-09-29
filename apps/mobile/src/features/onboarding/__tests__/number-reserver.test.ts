/**
 * When `start_pass` goes out: once per request while nothing is in flight, never again after a
 * refusal, and after a transient failure only on the backoff timer or when the device is back
 * online, however many draft edits ask in between.
 */
jest.mock(
  '@powersync/common',
  () =>
    jest.requireActual<{ powersyncCommon: unknown }>('@/data/powersync/test-support/node-realm')
      .powersyncCommon,
);

import { describe, expect, it, jest } from '@jest/globals';

import type { SendResult } from '@/data/commands/client';
import { createNetworkState } from '@/data/status/network';

import { createNumberReserver } from '../flow-controller/number-reserver';

const PASS_ID = '0190f5a4-0000-7000-8000-0000000000a1';
const QUICK = { baseMs: 20, maxMs: 40, random: () => 1 };

function setup(answers: SendResult[], wanted = () => true) {
  const sent: string[] = [];
  const applied: unknown[] = [];
  const network = createNetworkState(true);
  const reserver = createNumberReserver({
    payload: () => (wanted() ? { pass_id: PASS_ID } : null),
    send: (payload) => {
      sent.push(payload.pass_id);
      const answer = answers.shift() ?? answers.at(-1);
      return Promise.resolve(answer ?? { kind: 'unavailable', opId: 'x', code: 'NETWORK' });
    },
    onApplied: (result) => applied.push(result),
    network,
    backoff: QUICK,
  });
  return { reserver, sent, applied, network };
}

const tick = () => new Promise((resolve) => setTimeout(resolve, 0));
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const REJECTED: SendResult = { kind: 'rejected', opId: 'a', code: 'VALIDATION' };
const UNAVAILABLE: SendResult = { kind: 'unavailable', opId: 'b', code: 'NETWORK' };
const APPLIED: SendResult = { kind: 'applied', opId: 'c', result: { number: '000042' } };

describe('number reserver', () => {
  it('sends once and hands over the reserved number', async () => {
    const { reserver, sent, applied } = setup([APPLIED]);
    reserver.request();
    reserver.request();
    await tick();
    reserver.request();
    expect(sent).toHaveLength(1);
    expect(applied).toEqual([{ number: '000042' }]);
    expect(reserver.state()).toBe('reserved');
    reserver.stop();
  });

  it('never resends a refused start_pass, whatever the draft does', async () => {
    const { reserver, sent } = setup([REJECTED]);
    reserver.request();
    await tick();
    for (let edit = 0; edit < 20; edit += 1) reserver.request();
    await wait(60);
    expect(sent).toHaveLength(1);
    expect(reserver.state()).toBe('refused');
    reserver.stop();
  });

  it('retries a transient failure on the backoff timer, not on draft edits', async () => {
    const { reserver, sent } = setup([UNAVAILABLE, APPLIED]);
    reserver.request();
    await tick();
    for (let edit = 0; edit < 20; edit += 1) reserver.request();
    expect(sent).toHaveLength(1);
    expect(reserver.state()).toBe('waiting');
    await wait(60);
    expect(sent).toHaveLength(2);
    expect(reserver.state()).toBe('reserved');
    reserver.stop();
  });

  it('retries at once when the device comes back online', async () => {
    const { reserver, sent, network } = setup([UNAVAILABLE, APPLIED]);
    reserver.request();
    await tick();
    network.set(false);
    network.set(true);
    await tick();
    expect(sent).toHaveLength(2);
    reserver.stop();
  });

  it('drops a pending retry once the number is no longer wanted, and after stop', async () => {
    let wanted = true;
    const { reserver, sent } = setup([UNAVAILABLE], () => wanted);
    reserver.request();
    await tick();
    wanted = false;
    await wait(60);
    expect(sent).toHaveLength(1);
    expect(reserver.state()).toBe('idle');

    wanted = true;
    reserver.request();
    await tick();
    reserver.stop();
    await wait(60);
    expect(sent).toHaveLength(2);
  });
});
