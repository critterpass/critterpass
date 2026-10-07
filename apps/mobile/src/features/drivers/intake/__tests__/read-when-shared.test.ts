import { describe, expect, it } from '@jest/globals';
import type { IntakeReadResult } from '@cp/domain';

import type { Outcome } from '../../shared/api';
import { readWhenShared } from '../read-when-shared';

const noWait = () => Promise.resolve();
const ok = { kind: 'ok', value: { parsed: null } } as unknown as Outcome<IntakeReadResult>;
const notFound: Outcome<IntakeReadResult> = { kind: 'error', code: 'NOT_FOUND' };

function apiAnswering(answers: readonly Outcome<IntakeReadResult>[]) {
  let calls = 0;
  return {
    api: {
      readIntake: () => {
        const answer = answers[Math.min(calls, answers.length - 1)] as Outcome<IntakeReadResult>;
        calls += 1;
        return Promise.resolve(answer);
      },
    },
    calls: () => calls,
  };
}

describe('reading a shared driver message', () => {
  it('asks again until the queued share has reached the api', async () => {
    const { api, calls } = apiAnswering([notFound, notFound, ok]);
    await expect(readWhenShared(api, 'intake', 12, noWait)).resolves.toBe(ok);
    expect(calls()).toBe(3);
  });

  it('gives up for now when the share never arrives, leaving it to be read later', async () => {
    const { api, calls } = apiAnswering([notFound]);
    await expect(readWhenShared(api, 'intake', 4, noWait)).resolves.toBeNull();
    expect(calls()).toBe(4);
  });

  it('does not ask again offline', async () => {
    const { api, calls } = apiAnswering([{ kind: 'offline' }]);
    await expect(readWhenShared(api, 'intake', 12, noWait)).resolves.toBeNull();
    expect(calls()).toBe(1);
  });

  it('hands back a failed read at once, so the card opens to be typed in', async () => {
    const failed: Outcome<IntakeReadResult> = { kind: 'error', code: 'INTERNAL' };
    const { api, calls } = apiAnswering([failed]);
    await expect(readWhenShared(api, 'intake', 12, noWait)).resolves.toBe(failed);
    expect(calls()).toBe(1);
  });
});
