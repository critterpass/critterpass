/**
 * How a plan change reads in the inbox: the card for a change waiting for the reader's yes ("Minh
 * wants to add Bà Nà Hills · Wed 21 Oct, 07:00"), and the entry when the vote closed, saying what
 * was decided and what changed in the plan instead of a bare score, and an organiser's own edit
 * to the locked plan ("Linh added Sơn Trà · Wed 21 Oct, 12:45"). The rows carry the place, the
 * day and the time; the words and the date's format are the reader's.
 */
import { msg, plural } from '@lingui/core/macro';

import { PLAN_CHANGE_INBOX_KIND } from '@cp/domain';
import { format } from '@cp/i18n';

import type { InboxItem } from './inbox-data';
import type { InboxRenderContext, InboxRenderer } from './kind-renderers';

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

/** "Wed 21 Oct, 07:00", "Wed 21 Oct", "07:00" or '' for where a change lands. */
export function planChangeWhen(locale: string, date: string, time: string): string {
  const day = /^\d{4}-\d{2}-\d{2}$/u.test(date)
    ? // Midday UTC keeps the calendar date in every zone.
      // eslint-disable-next-line lingui/no-unlocalized-strings -- a date literal and Intl options.
      format.date(locale, new Date(`${date}T12:00:00Z`), {
        weekday: 'short',
        day: 'numeric',
        month: 'short',
        timeZone: 'UTC',
      })
    : '';
  return [day, time].filter((part) => part !== '').join(', ');
}

/** What the change is, as a phrase: "Bà Nà Hills, Wed 21 Oct, 07:00". */
function what(item: InboxItem, ctx: InboxRenderContext): string {
  const title = text(item.data['title']);
  const when = planChangeWhen(ctx.i18n.locale, text(item.data['date']), text(item.data['time']));
  return [title, when].filter((part) => part !== '').join(', ');
}

const single = (item: InboxItem): boolean =>
  Number(item.data['count'] ?? 0) === 1 && text(item.data['title']) !== '';

function asked(item: InboxItem, ctx: InboxRenderContext): string {
  const name = item.actorName;
  const change = what(item, ctx);
  const count = Number(item.data['count'] ?? 0);
  if (!single(item)) {
    return ctx.i18n._(
      msg({
        id: 'home.inbox.planChange.askedMany',
        message: plural(count, {
          one: `${name} wants # change to the plan`,
          other: `${name} wants # changes to the plan`,
        }),
      }),
    );
  }
  switch (text(item.data['op'])) {
    case 'add':
      return ctx.i18n._(
        msg({ id: 'home.inbox.planChange.askedAdd', message: `${name} wants to add ${change}` }),
      );
    case 'remove':
      return ctx.i18n._(
        msg({
          id: 'home.inbox.planChange.askedRemove',
          message: `${name} wants to drop ${change}`,
        }),
      );
    default:
      return ctx.i18n._(
        msg({ id: 'home.inbox.planChange.askedMove', message: `${name} wants to move ${change}` }),
      );
  }
}

function decided(item: InboxItem, ctx: InboxRenderContext): string {
  const change = what(item, ctx);
  const outcome = text(item.data['outcome']);
  if (outcome === 'ran_out') {
    return ctx.i18n._(
      msg({
        id: 'home.inbox.planChange.ranOut',
        message: 'The vote ran out. The plan stays as it was.',
      }),
    );
  }
  if (outcome === 'kept') {
    return single(item)
      ? ctx.i18n._(
          msg({
            id: 'home.inbox.planChange.keptOne',
            message: `The crew said no to ${change}. The plan stays as it was.`,
          }),
        )
      : ctx.i18n._(
          msg({
            id: 'home.inbox.planChange.kept',
            message: 'The crew said no. The plan stays as it was.',
          }),
        );
  }
  if (!single(item)) {
    return ctx.i18n._(
      msg({ id: 'home.inbox.planChange.applied', message: 'The crew said yes. The plan changed.' }),
    );
  }
  switch (text(item.data['op'])) {
    case 'add':
      return ctx.i18n._(
        msg({ id: 'home.inbox.planChange.added', message: `${change} is in the plan` }),
      );
    case 'remove':
      return ctx.i18n._(
        msg({ id: 'home.inbox.planChange.removed', message: `${change} is off the plan` }),
      );
    default:
      return ctx.i18n._(
        msg({ id: 'home.inbox.planChange.moved', message: `The plan now has ${change}` }),
      );
  }
}

/** An organiser's own edit to the locked plan: who changed what, no vote involved. */
function edited(item: InboxItem, ctx: InboxRenderContext): string {
  const name = item.actorName;
  const change = what(item, ctx);
  if (!single(item)) {
    const count = Number(item.data['count'] ?? 0);
    return ctx.i18n._(
      msg({
        id: 'home.inbox.planChange.editedMany',
        message: plural(count, {
          one: `${name} made # change to the plan`,
          other: `${name} made # changes to the plan`,
        }),
      }),
    );
  }
  switch (text(item.data['op'])) {
    case 'add':
      return ctx.i18n._(
        msg({ id: 'home.inbox.planChange.editedAdd', message: `${name} added ${change}` }),
      );
    case 'remove':
      return ctx.i18n._(
        msg({ id: 'home.inbox.planChange.editedRemove', message: `${name} dropped ${change}` }),
      );
    default:
      return ctx.i18n._(
        msg({ id: 'home.inbox.planChange.editedMove', message: `${name} moved ${change}` }),
      );
  }
}

const DECIDED: InboxRenderer = { line: decided };

export const PLAN_CHANGE_RENDERERS: readonly (readonly [string, InboxRenderer])[] = [
  [
    PLAN_CHANGE_INBOX_KIND.voteNeeded,
    {
      icon: 'ticket',
      tone: 'pink',
      card: (item, ctx) => ({
        title: asked(item, ctx),
        body: ctx.i18n._(
          msg({ id: 'home.inbox.planChange.body', message: 'It goes in when the crew says yes.' }),
        ),
      }),
      line: asked,
      actionLabel: (_action, _item, ctx) =>
        ctx.i18n._(msg({ id: 'home.inbox.planChange.open', message: 'See the change' })),
    },
  ],
  [PLAN_CHANGE_INBOX_KIND.applied, DECIDED],
  [PLAN_CHANGE_INBOX_KIND.kept, DECIDED],
  [PLAN_CHANGE_INBOX_KIND.ranOut, DECIDED],
  [PLAN_CHANGE_INBOX_KIND.edited, { line: edited }],
];
