import { msg } from '@lingui/core/macro';

import type { InboxItem, InboxRenderContext } from '@/features/home';

/**
 * Where the answers stand for the organiser. Everyone having answered only means "lock it" when the
 * lock would go through: someone is in, or everyone said they can't make it. Rows filed before the
 * counts carried `going` read as before.
 */
export function answeredBody(item: InboxItem, ctx: InboxRenderContext): string {
  const answered = Number(item.data['answered'] ?? 0);
  const recipients = Number(item.data['recipients'] ?? 0);
  if (recipients <= 0 || answered < recipients) {
    return ctx.i18n._(
      msg({
        id: 'proposal.inbox.answered.some',
        message: `${answered} of ${recipients} answered so far.`,
      }),
    );
  }
  const going = item.data['going'];
  const out = Number(item.data['out'] ?? 0);
  if (typeof going === 'number' && going === 0 && out < recipients) {
    return ctx.i18n._(
      msg({
        id: 'proposal.inbox.answered.nobodyIn',
        message:
          "Everyone has answered, but nobody is in yet. You can lock the trip once someone's in.",
      }),
    );
  }
  return ctx.i18n._(
    msg({
      id: 'proposal.inbox.answered.allIn',
      message: 'Everyone has answered. Lock the trip to confirm it.',
    }),
  );
}
