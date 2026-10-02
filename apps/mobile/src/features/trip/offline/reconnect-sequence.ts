/**
 * The SENDS WHEN YOU'RE BACK list through a reconnect (3k-4): offline it mirrors the upload queue;
 * back online each line ticks the moment its op is acknowledged (it leaves the queue, or the
 * server said done), in the order the acks really arrive, never on a timer. Once every line has
 * ticked the banner says "Back online" and then lifts. Pure: fed the sync phase and queue
 * snapshots.
 */
import type { MessageDescriptor } from '@lingui/core';

export interface QueueSnapshotItem {
  readonly opId: string;
  readonly cmd: string;
  readonly status: 'queued' | 'sending' | 'done';
  readonly summary: MessageDescriptor;
}

export interface ReconnectItem {
  readonly opId: string;
  readonly cmd: string;
  readonly summary: MessageDescriptor;
  readonly sent: boolean;
  /** Place among the acks of one queue update (drives the 350 + 330 × n ms tick stagger). */
  readonly tickIndex: number;
}

export interface ReconnectState {
  readonly phase: 'online' | 'offline' | 'reconnecting' | 'back';
  readonly items: readonly ReconnectItem[];
  /** Op ids in the order their acks arrived. */
  readonly acked: readonly string[];
}

export const INITIAL_RECONNECT: ReconnectState = { phase: 'online', items: [], acked: [] };

export function stepReconnect(
  state: ReconnectState,
  offline: boolean,
  queue: readonly QueueSnapshotItem[],
): ReconnectState {
  if (offline) {
    return {
      phase: 'offline',
      items: queue.map((op) => ({
        opId: op.opId,
        cmd: op.cmd,
        summary: op.summary,
        sent: false,
        tickIndex: 0,
      })),
      acked: [],
    };
  }
  if (state.phase === 'online') return state;
  // "Back online" holds until the card lifts; only losing the network again ends it. The ops it
  // ticked leave the queue as their results sync down, and that must not cut the hold short.
  if (state.phase === 'back') return state;
  const waiting = new Map(queue.filter((op) => op.status !== 'done').map((op) => [op.opId, op]));
  const acked = [...state.acked];
  let batch = 0;
  const items = state.items.map((item) => {
    if (item.sent || waiting.has(item.opId)) return item;
    acked.push(item.opId);
    return { ...item, sent: true, tickIndex: batch++ };
  });
  // Written while reconnecting: they join the list and tick like the rest.
  const known = new Set(items.map((item) => item.opId));
  for (const op of queue) {
    if (!known.has(op.opId) && op.status !== 'done') {
      items.push({ opId: op.opId, cmd: op.cmd, summary: op.summary, sent: false, tickIndex: 0 });
    }
  }
  const allSent = items.every((item) => item.sent);
  return { phase: allSent ? 'back' : 'reconnecting', items, acked };
}
