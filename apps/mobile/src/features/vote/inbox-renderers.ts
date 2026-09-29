/**
 * How the poll inbox kinds read on Home's inbox: a vote that needs you (the question and the
 * answers as inline buttons), the destination final, the organiser's tie to settle, and the result
 * ("Kyoto won 4–2"). The server files ids, labels and the score; every word is drawn here.
 */
import type { I18n } from '@lingui/core';
import { msg } from '@lingui/core/macro';

import { POLL_INBOX_KIND, type InboxAction } from '@cp/domain';

import { registerInboxRenderer, type InboxItem } from '@/features/home';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';

import { guideOr } from './format';

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

function guideName(item: InboxItem): string {
  return GUIDE_STICKERS[guideOr(text(item.data['guide']))].name;
}

function optionLabels(item: InboxItem): Map<string, string> {
  const options = Array.isArray(item.data['options']) ? (item.data['options'] as unknown[]) : [];
  const labels = new Map<string, string>();
  for (const option of options) {
    if (typeof option !== 'object' || option === null) continue;
    const { id, label } = option as Record<string, unknown>;
    if (typeof id === 'string' && typeof label === 'string') labels.set(id, label);
  }
  return labels;
}

/** An inline vote button reads as its answer; "open" reads as a look at the poll. */
function voteActionLabel(action: InboxAction, item: InboxItem, i18n: I18n): string {
  const optionId = action.payload?.['option_id'];
  const label = typeof optionId === 'string' ? optionLabels(item).get(optionId) : undefined;
  return label ?? i18n._(msg({ id: 'vote.inbox.open', message: 'Open the vote' }));
}

function finalists(item: InboxItem, i18n: I18n): string {
  const [first, second] = [...optionLabels(item).values()];
  if (first === undefined || second === undefined) {
    return i18n._(msg({ id: 'vote.inbox.finalShort', message: 'Two places left' }));
  }
  return i18n._(msg({ id: 'vote.inbox.finalists', message: `${first} or ${second}` }));
}

let registered = false;

export function registerPollInboxRenderers(): void {
  if (registered) return;
  registered = true;
  registerInboxRenderer(POLL_INBOX_KIND.voteNeeded, {
    icon: 'check',
    tone: 'yellow',
    card: (item, { i18n }) => {
      const question = text(item.data['question']);
      const name = item.actorName;
      return item.data['kind'] === 'destination'
        ? { title: i18n._(msg({ id: 'vote.inbox.whereNext', message: 'Where next? Your vote' })) }
        : {
            title:
              question === ''
                ? i18n._(msg({ id: 'vote.inbox.voteTitle', message: `${name} started a vote` }))
                : question,
            body: i18n._(msg({ id: 'vote.inbox.voteBody', message: `${name} asked the crew` })),
          };
    },
    line: (item, { i18n }) => {
      const name = item.actorName;
      return i18n._(msg({ id: 'vote.inbox.voteLine', message: `${name} started a vote` }));
    },
    actionLabel: (action, item, { i18n }) => voteActionLabel(action, item, i18n),
  });
  registerInboxRenderer(POLL_INBOX_KIND.finalOpen, {
    icon: 'star',
    tone: 'pink',
    card: (item, { i18n }) => ({
      title: i18n._(msg({ id: 'vote.inbox.finalTitle', message: 'The final is on' })),
      body: finalists(item, i18n),
    }),
    line: (item, { i18n }) => {
      const both = finalists(item, i18n);
      return i18n._(msg({ id: 'vote.inbox.finalLine', message: `Final: ${both}` }));
    },
    actionLabel: (action, item, { i18n }) => voteActionLabel(action, item, i18n),
  });
  registerInboxRenderer(POLL_INBOX_KIND.pickNeeded, {
    icon: 'spark',
    tone: 'orange',
    card: (item, { i18n }) => {
      const guide = guideName(item);
      return {
        title: i18n._(msg({ id: 'vote.inbox.pickTitle', message: 'A tie for the final' })),
        body: i18n._(
          msg({ id: 'vote.inbox.pickBody', message: `${guide} needs you to pick the last spot.` }),
        ),
      };
    },
    line: (_item, { i18n }) =>
      i18n._(msg({ id: 'vote.inbox.pickLine', message: 'Pick the last spot in the final' })),
    actionLabel: (_action, _item, { i18n }) =>
      i18n._(msg({ id: 'vote.inbox.pick', message: 'Pick one' })),
  });
  registerInboxRenderer(POLL_INBOX_KIND.result, {
    icon: 'star',
    line: (item, { i18n }) => {
      const winner = text(item.data['winner_label']);
      const score = text(item.data['score']);
      return i18n._(msg({ id: 'vote.inbox.result', message: `${winner} won ${score}` }));
    },
  });
}
