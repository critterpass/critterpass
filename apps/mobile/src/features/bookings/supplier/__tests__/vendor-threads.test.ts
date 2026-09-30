/**
 * Messages to places: a thread's card follows its newest outbound message and any reply after it,
 * so "Sent, waiting" never shows once the place answered and a draft is never shown as sent.
 */
import { describe, expect, it } from '@jest/globals';

import type { VendorThreadView } from '@cp/domain';

import { threadPhase } from '../thread-phase';

type Message = VendorThreadView['messages'][number];

function thread(channel: VendorThreadView['channel'], messages: Message[]): VendorThreadView {
  return { thread_id: 't', vendor_name: 'Locavore', channel, status: 'open', messages };
}

const out = (status: Message['status'], at: string): Message => ({
  id: `o-${at}`,
  direction: 'outbound',
  body: 'Table for 6?',
  status,
  at,
  reply: null,
});
const reply = (at: string): Message => ({
  id: `i-${at}`,
  direction: 'inbound',
  body: 'ok bisa',
  status: 'received',
  at,
  reply: { intent: 'yes', times: [], prices: [], needs_person: false },
});

describe('vendor thread phase', () => {
  it('asks to send a draft, or to share it from the traveller’s WhatsApp while the desk is off', () => {
    expect(threadPhase(thread('whatsapp_business', [out('draft', '1')])).phase).toBe('draft');
    expect(threadPhase(thread('self_send', [out('draft', '1')])).phase).toBe('self_send');
  });

  it('waits after sending and shows the reply once it came', () => {
    expect(threadPhase(thread('whatsapp_business', [out('approved', '1')])).phase).toBe('approved');
    expect(threadPhase(thread('whatsapp_business', [out('delivered', '1')])).phase).toBe('waiting');
    const answered = threadPhase(thread('whatsapp_business', [out('read', '1'), reply('2')]));
    expect(answered.phase).toBe('replied');
    expect(answered.reply?.body).toBe('ok bisa');
  });

  it('puts a newer draft ahead of an older reply', () => {
    expect(
      threadPhase(thread('whatsapp_business', [out('read', '1'), reply('2'), out('draft', '3')]))
        .phase,
    ).toBe('draft');
  });
});
