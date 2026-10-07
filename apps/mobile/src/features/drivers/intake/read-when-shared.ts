import type { IntakeReadResult } from '@cp/domain';

import type { DriversApi, Outcome } from '../shared/api';

const pause = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Reads a shared message into a card once the share has reached the api. The share is queued on
 * the phone and uploads a moment later, so the api may not know the message yet: the read is tried
 * again while it answers NOT_FOUND. Null when the phone is offline or the share is still waiting
 * after `tries` (it stays in the shared list, to be read later).
 */
export async function readWhenShared(
  api: Pick<DriversApi, 'readIntake'>,
  intakeId: string,
  tries = 12,
  wait: (ms: number) => Promise<void> = pause,
): Promise<Outcome<IntakeReadResult> | null> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const read = await api.readIntake(intakeId);
    if (read.kind === 'offline') return null;
    if (read.kind === 'ok' || read.code !== 'NOT_FOUND') return read;
    await wait(1000);
  }
  return null;
}
