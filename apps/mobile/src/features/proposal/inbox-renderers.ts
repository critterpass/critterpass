/**
 * How the proposal's inbox items read: the plan waiting for the reader's answer (a card until
 * they answer), a crewmate's answer for the organiser (one card, the newest, until the lock) and
 * the lock itself (a quiet entry). The rows carry ids, a place and counts; the words are here.
 */
import { msg } from '@lingui/core/macro';

import { PROPOSAL_INBOX_KIND } from '@cp/domain';

import { registerInboxRenderer, type InboxItem, type InboxRenderContext } from '@/features/home';

import { instantDate } from './data/format';

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function receivedLine(item: InboxItem, ctx: InboxRenderContext): string {
  const name = item.actorName;
  const place = text(item.data['place']);
  return name === ''
    ? ctx.i18n._(
        msg({ id: 'proposal.inbox.received.plain', message: `The plan for ${place} is here` }),
      )
    : ctx.i18n._(
        msg({ id: 'proposal.inbox.received', message: `${name} sent the plan for ${place}` }),
      );
}

function answeredLine(item: InboxItem, ctx: InboxRenderContext): string {
  const name = item.actorName;
  switch (text(item.data['rsvp'])) {
    case 'in':
      return ctx.i18n._(msg({ id: 'proposal.inbox.answered.in', message: `${name} is in` }));
    case 'maybe':
      return ctx.i18n._(
        msg({ id: 'proposal.inbox.answered.maybe', message: `${name} is a maybe` }),
      );
    case 'out':
      return ctx.i18n._(
        msg({ id: 'proposal.inbox.answered.out', message: `${name} can't make it` }),
      );
    default:
      return ctx.i18n._(
        msg({ id: 'proposal.inbox.answered.waitlisted', message: `${name} is on the waitlist` }),
      );
  }
}

let registered = false;

export function registerProposalInboxRenderers(): void {
  if (registered) return;
  registered = true;

  registerInboxRenderer(PROPOSAL_INBOX_KIND.received, {
    icon: 'ticket',
    tone: 'yellow',
    card: (item, ctx) => {
      const replyBy = text(item.data['reply_by']);
      const date = replyBy === '' ? '' : instantDate(ctx.i18n.locale, replyBy);
      return {
        title: receivedLine(item, ctx),
        body:
          date === ''
            ? ctx.i18n._(msg({ id: 'proposal.inbox.received.body', message: 'Are you in?' }))
            : ctx.i18n._(
                msg({ id: 'proposal.inbox.received.bodyBy', message: `Answer by ${date}.` }),
              ),
      };
    },
    line: receivedLine,
    actionLabel: (_action, _item, ctx) =>
      ctx.i18n._(msg({ id: 'proposal.inbox.received.open', message: 'Read it and answer' })),
  });

  registerInboxRenderer(PROPOSAL_INBOX_KIND.answered, {
    icon: 'ticket',
    tone: 'green',
    card: (item, ctx) => {
      const answered = Number(item.data['answered'] ?? 0);
      const recipients = Number(item.data['recipients'] ?? 0);
      return {
        title: answeredLine(item, ctx),
        body:
          recipients > 0 && answered >= recipients
            ? ctx.i18n._(
                msg({
                  id: 'proposal.inbox.answered.allIn',
                  message: 'Everyone has answered. Lock the trip to confirm it.',
                }),
              )
            : ctx.i18n._(
                msg({
                  id: 'proposal.inbox.answered.some',
                  message: `${answered} of ${recipients} answered so far.`,
                }),
              ),
      };
    },
    line: answeredLine,
    actionLabel: (_action, _item, ctx) =>
      ctx.i18n._(msg({ id: 'proposal.inbox.answered.open', message: "Who's in?" })),
  });

  registerInboxRenderer(PROPOSAL_INBOX_KIND.tripLocked, {
    line: (item, ctx) => {
      const place = text(item.data['place']);
      return ctx.i18n._(
        msg({
          id: 'proposal.inbox.lockedIn',
          message: `${place} is locked in. The trip is confirmed.`,
        }),
      );
    },
  });
}
