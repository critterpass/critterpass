/**
 * How each inbox kind reads: the card's tile, title and live body for needs-you items, the one-line
 * EARLIER row, and the label on each inline action. The server files ids and short values only;
 * every word is rendered here, in the reader's language. Features register their own kinds (poll
 * votes, approvals, RSVP follow-ups, payments); an unknown kind still gets a readable row.
 */
import type { I18n, MessageDescriptor } from '@lingui/core';
import { msg, plural } from '@lingui/core/macro';

import { IDEAS_INBOX_KIND, INBOX_KIND, type InboxAction } from '@cp/domain';

import type { CardTone } from '@/ui/cards/tone';
import type { DoodleName } from '@/ui/icons/generated';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';

import { guideOr } from '../format';
import type { InboxItem } from './inbox-data';
import { PLAN_CHANGE_RENDERERS } from './plan-change-renderers';

export interface InboxRenderContext {
  readonly i18n: I18n;
  readonly now: Date;
}

export interface InboxCardCopy {
  readonly title: string;
  readonly body?: string;
}

export interface InboxRenderer {
  /** The card's 40 pt tile. */
  readonly icon?: DoodleName;
  readonly tone?: CardTone;
  readonly card?: (item: InboxItem, ctx: InboxRenderContext) => InboxCardCopy;
  readonly line: (item: InboxItem, ctx: InboxRenderContext) => string;
  readonly actionLabel?: (action: InboxAction, item: InboxItem, ctx: InboxRenderContext) => string;
}

const renderers = new Map<string, InboxRenderer>();

/** Registers a kind's renderer (a feature module, at load); a later registration replaces it. */
export function registerInboxRenderer(kind: string, renderer: InboxRenderer): () => void {
  renderers.set(kind, renderer);
  return () => {
    if (renderers.get(kind) === renderer) renderers.delete(kind);
  };
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '');
const say = (ctx: InboxRenderContext, descriptor: MessageDescriptor): string =>
  ctx.i18n._(descriptor);

function guideName(item: InboxItem): string {
  return GUIDE_STICKERS[guideOr(text(item.data['guide']))].name;
}

const FALLBACK: InboxRenderer = {
  icon: 'spark',
  line: (_item, ctx) =>
    say(ctx, msg({ id: 'home.inbox.generic', message: 'Something new for you' })),
  card: (_item, ctx) => ({
    title: say(ctx, msg({ id: 'home.inbox.genericTitle', message: 'Something needs you' })),
  }),
};

export function inboxRenderer(kind: string): InboxRenderer {
  return renderers.get(kind) ?? FALLBACK;
}

function nudgeAbout(reason: string, ctx: InboxRenderContext): string {
  switch (reason) {
    case 'vote':
      return say(
        ctx,
        msg({ id: 'home.inbox.nudge.vote', message: 'The crew is waiting on your vote.' }),
      );
    case 'rsvp':
      return say(
        ctx,
        msg({ id: 'home.inbox.nudge.rsvp', message: "They'd love to know if you're in." }),
      );
    case 'readiness':
      return say(
        ctx,
        msg({ id: 'home.inbox.nudge.readiness', message: "They're getting ready to go." }),
      );
    case 'payment':
      return say(
        ctx,
        msg({ id: 'home.inbox.nudge.payment', message: 'A settle-up is waiting for you.' }),
      );
    default:
      return say(
        ctx,
        msg({ id: 'home.inbox.nudge.invite', message: "They're saving you a spot." }),
      );
  }
}

function placedLine(item: InboxItem, ctx: InboxRenderContext): string {
  const guide = guideName(item);
  const count = Number(item.data['count'] ?? 0);
  return say(
    ctx,
    msg({
      id: 'home.inbox.ideasPlaced.title',
      message: plural(count, {
        one: `${guide} found a spot for # idea`,
        other: `${guide} found a spot for # ideas`,
      }),
    }),
  );
}

let registered = false;

/**
 * Home's own kinds: crewmates joining, invite opens, nudges, the guide's changes and placed
 * ideas, plan changes put to a vote, fare drops.
 */
export function registerHomeInboxRenderers(): void {
  if (registered) return;
  registered = true;

  registerInboxRenderer(INBOX_KIND.memberJoined, {
    line: (item, ctx) => {
      const name = item.actorName;
      const crew = item.crewName;
      return say(ctx, msg({ id: 'home.inbox.memberJoined', message: `${name} joined ${crew}` }));
    },
  });

  registerInboxRenderer(INBOX_KIND.inviteOpened, {
    line: (item, ctx) => {
      const crew = item.crewName;
      return crew === ''
        ? say(ctx, msg({ id: 'home.inbox.inviteOpened', message: 'Someone opened your invite' }))
        : say(
            ctx,
            msg({
              id: 'home.inbox.inviteOpenedCrew',
              message: `Someone opened your invite to ${crew}`,
            }),
          );
    },
  });

  registerInboxRenderer(INBOX_KIND.nudgeReceived, {
    icon: 'ticket',
    tone: 'orange',
    card: (item, ctx) => {
      const name = item.actorName;
      return {
        title: say(ctx, msg({ id: 'home.inbox.nudge.title', message: `${name} nudged you` })),
        body: nudgeAbout(text(item.data['reason']), ctx),
      };
    },
    line: (item, ctx) => {
      const name = item.actorName;
      return say(ctx, msg({ id: 'home.inbox.nudge.line', message: `${name} nudged you` }));
    },
    actionLabel: (_action, _item, ctx) =>
      say(ctx, msg({ id: 'home.inbox.nudge.open', message: 'Take a look' })),
  });

  registerInboxRenderer(INBOX_KIND.guideActionExecuted, {
    line: (item, ctx) => {
      const guide = guideName(item);
      const summary = text(item.data['summary']);
      return summary === ''
        ? say(ctx, msg({ id: 'home.inbox.guideChanged', message: `${guide} changed the plan` }))
        : say(ctx, msg({ id: 'home.inbox.guideDid', message: `${guide} ${summary}` }));
    },
    actionLabel: (_action, _item, ctx) => say(ctx, msg({ id: 'home.inbox.undo', message: 'Undo' })),
  });

  // The guide finished placing the reader's ideas: their review waits until it is sent or applied.
  registerInboxRenderer(IDEAS_INBOX_KIND.placed, {
    card: (item, ctx) => ({
      title: placedLine(item, ctx),
      body: say(
        ctx,
        msg({
          id: 'home.inbox.ideasPlaced.body',
          message: 'Look them over before they go in the plan.',
        }),
      ),
    }),
    line: placedLine,
    actionLabel: (_action, _item, ctx) =>
      say(ctx, msg({ id: 'home.inbox.ideasPlaced.open', message: 'Review' })),
  });

  for (const [kind, renderer] of PLAN_CHANGE_RENDERERS) registerInboxRenderer(kind, renderer);

  registerInboxRenderer(INBOX_KIND.tipPriceDrop, {
    line: (item, ctx) => {
      const guide = guideName(item);
      const tip = text(item.data['text']);
      return say(ctx, msg({ id: 'home.inbox.tip', message: `${guide}: ${tip}` }));
    },
  });
}
