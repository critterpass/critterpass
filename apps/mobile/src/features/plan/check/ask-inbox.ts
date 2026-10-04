/**
 * The private ask's inbox row (`check.member_ask`), for the asked member: who asked, with YES and
 * NO inline; its link opens the plan check, where the same ask waits as a card. The row carries the
 * ask's id only, so it reads the same for everyone it could reach (only that member).
 */
import { msg } from '@lingui/core/macro';

import { CHECK_INBOX_KIND } from '@cp/domain';

import { registerInboxRenderer } from '@/features/home';

let registered = false;

export function registerAskInboxRenderer(): void {
  if (registered) return;
  registered = true;
  registerInboxRenderer(CHECK_INBOX_KIND.memberAsk, {
    icon: 'spark',
    tone: 'yellow',
    card: (item, { i18n }) => {
      const name = item.actorName;
      return {
        title: i18n._(
          msg({ id: 'plan.check.inbox.title', message: `${name} asked you about your saves` }),
        ),
        body: i18n._(msg({ id: 'plan.check.inbox.body', message: 'Only you two see this.' })),
      };
    },
    line: (item, { i18n }) => {
      const name = item.actorName;
      return i18n._(
        msg({ id: 'plan.check.inbox.line', message: `${name} asked you about your saves` }),
      );
    },
    actionLabel: (action, _item, { i18n }) =>
      action.id === 'yes'
        ? i18n._(msg({ id: 'plan.check.inbox.yes', message: 'Add them' }))
        : i18n._(msg({ id: 'plan.check.inbox.no', message: 'Not now' })),
  });
}
