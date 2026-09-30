/** Where a message to a place stands, from the thread the api returns. */
/* eslint-disable lingui/no-unlocalized-strings -- message statuses and channels, wire values. */
import type { VendorThreadView } from '@cp/domain';

export type ThreadPhase = 'draft' | 'self_send' | 'approved' | 'waiting' | 'replied' | 'failed';

type Message = VendorThreadView['messages'][number];

/** Where a thread stands, from its newest outbound message and any reply after it. */
export function threadPhase(thread: VendorThreadView): {
  readonly phase: ThreadPhase;
  readonly outbound: Message | null;
  readonly reply: Message | null;
} {
  const outbound = [...thread.messages].reverse().find((m) => m.direction === 'outbound') ?? null;
  const reply = [...thread.messages].reverse().find((m) => m.direction === 'inbound') ?? null;
  if (reply !== null && (outbound === null || reply.at >= outbound.at))
    return { phase: 'replied', outbound, reply };
  if (outbound === null) return { phase: 'waiting', outbound, reply };
  if (outbound.status === 'draft')
    return { phase: thread.channel === 'self_send' ? 'self_send' : 'draft', outbound, reply };
  if (outbound.status === 'approved') return { phase: 'approved', outbound, reply };
  if (outbound.status === 'failed') return { phase: 'failed', outbound, reply };
  return { phase: 'waiting', outbound, reply };
}
