/**
 * Sends live fixes for the user's open share (crew map, Help, SOS) to `POST /v1/loc`: a batch
 * every 5 s (the server's limit; SOS every 2 s, which the server exempts). Fixes are live only:
 * held in memory, never written anywhere, and a batch that cannot be sent is dropped rather than
 * queued — a late position is worse than none.
 */
import { LOCATION_BATCH_MAX } from '@cp/domain';

import type { EngineFix, FixUploader } from './ports';

export interface ActiveShare {
  readonly id: string;
  readonly reason: 'crew_map' | 'help' | 'sos';
}

export interface SharePublisherOptions {
  readonly upload: FixUploader;
  readonly now: () => number;
}

function activityOf(fix: EngineFix): 'unknown' | 'stationary' | 'walking' | 'automotive' {
  if (fix.stationary) return 'stationary';
  if (fix.speed === undefined) return 'unknown';
  return fix.speed > 7 ? 'automotive' : 'walking';
}

export function createSharePublisher(options: SharePublisherOptions) {
  let share: ActiveShare | null = null;
  let pending: EngineFix[] = [];
  let nextAllowedAt = 0;
  let lastSentAt = 0;
  let sending = false;

  const intervalMs = () => (share?.reason === 'sos' ? 2000 : 5000);

  return {
    setShare(next: ActiveShare | null): void {
      if (next?.id !== share?.id) pending = [];
      share = next;
    },
    activeShare: (): ActiveShare | null => share,
    push(fix: EngineFix): void {
      if (share === null) return;
      pending.push(fix);
      if (pending.length > LOCATION_BATCH_MAX) pending = pending.slice(-LOCATION_BATCH_MAX);
    },
    /** Sends what is pending when the interval allows; returns true when a batch went out. */
    async flush(): Promise<boolean> {
      const now = options.now();
      if (share === null || pending.length === 0 || sending) return false;
      if (now < nextAllowedAt || now - lastSentAt < intervalMs()) return false;
      const batch = pending;
      const target = share;
      pending = [];
      sending = true;
      try {
        const result = await options.upload({
          shareId: target.id,
          fixes: batch.map((fix) => ({
            lat: fix.lat,
            lng: fix.lng,
            acc: fix.acc,
            at: new Date(fix.at).toISOString(),
            mock: fix.mock,
            activity: activityOf(fix),
          })),
        });
        lastSentAt = now;
        if (result.status === 429) nextAllowedAt = now + (result.retryAfterS ?? 5) * 1000;
        // The share closed server-side (ended, or not ours): stop sending until told otherwise.
        if (result.status === 403 && share?.id === target.id) share = null;
        return result.status === 202;
      } catch {
        return false;
      } finally {
        sending = false;
      }
    },
    pendingCount: (): number => pending.length,
  };
}

export type SharePublisher = ReturnType<typeof createSharePublisher>;
