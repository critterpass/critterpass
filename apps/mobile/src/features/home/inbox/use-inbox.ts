/**
 * The inbox screen's state, shared by the current and the premium inbox: the items, the needs-you
 * cards (answered ones kept while they slide away), the EARLIER list under the chosen filter, the
 * app badge and opening an item (marks it read, then its screen in the tabs).
 */
/* eslint-disable lingui/no-unlocalized-strings -- filter values, not copy. */
import { currentAppPath } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useMemo, useState } from 'react';

import { openLink } from '@/lib/navigation/open-in-tabs';

import { useOwnerUid } from '../data/session-rows';
import { useMinuteClock } from '../data/use-home-state';
import type { InboxFilter } from './filter-tabs';
import { EARLIER_PAGE, isExpired, splitInbox, useInboxItems, type InboxItem } from './inbox-data';
import type { InboxRenderContext } from './kind-renderers';
import { useAppBadge } from './use-app-badge';
import { useInboxActions, type InboxActions } from './use-inbox-actions';

export function matchesFilter(item: InboxItem, filter: InboxFilter): boolean {
  if (filter === 'crew') return item.source === 'crew';
  if (filter === 'guides') return item.source === 'guide';
  return true;
}

export interface InboxState {
  readonly loaded: boolean;
  readonly now: Date;
  readonly ctx: InboxRenderContext;
  readonly actions: InboxActions;
  readonly unread: boolean;
  /** Open cards still asking for an answer (the badge). */
  readonly needsYou: number;
  /** Every item the user ever had (none = the first-time inbox). */
  readonly total: number;
  readonly filter: InboxFilter;
  readonly setFilter: (filter: InboxFilter) => void;
  readonly cards: readonly InboxItem[];
  readonly earlier: readonly InboxItem[];
  readonly caughtUp: boolean;
  readonly more: boolean;
  readonly showMore: () => void;
  readonly open: (item: InboxItem) => void;
}

export function useInbox(): InboxState {
  const { i18n } = useLingui();
  const uid = useOwnerUid();
  const minute = useMinuteClock();
  const [limit, setLimit] = useState(EARLIER_PAGE);
  const { items, loaded } = useInboxItems(uid, limit);
  const actions = useInboxActions();
  const now = useMemo(() => new Date(minute), [minute]);
  const lists = useMemo(() => splitInbox(items, now, limit), [items, now, limit]);
  const cards = [...lists.cards, ...actions.leaving.values()]
    .filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const needsYou = cards.filter(
    (item) => !actions.leaving.has(item.id) && !isExpired(item, now),
  ).length;
  useAppBadge(needsYou, loaded);
  const [chosen, setFilter] = useState<InboxFilter | null>(null);
  // NEEDS YOU is home: with nothing needing the user, Tokek sleeps over EARLIER.
  const filter: InboxFilter = chosen ?? 'needs_you';
  const shownCards = cards.filter((item) => matchesFilter(item, filter));
  const shownEarlier = lists.earlier.filter((item) => matchesFilter(item, filter));

  const open = (item: InboxItem) => {
    actions.markRead(item);
    // A row about a trip, the wallet or the pass opens in the tabs under the inbox, not over it.
    if (item.deepLink !== null) openLink(currentAppPath(item.deepLink));
  };

  return {
    loaded,
    now,
    ctx: { i18n, now },
    actions,
    unread: items.some((item) => !item.read),
    needsYou,
    total: items.length,
    filter,
    setFilter,
    cards: shownCards,
    earlier: shownEarlier,
    caughtUp: shownCards.length === 0 && (filter === 'needs_you' || shownEarlier.length === 0),
    more: lists.more,
    showMore: () => setLimit((current) => current + EARLIER_PAGE),
    open,
  };
}
