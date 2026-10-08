/**
 * Inbox (3b-4, 3b-5): one place for everything that needs the user, global across crews. Needs-you
 * cards sit on top and slide off once answered (from here, a notification or a widget: an item
 * settled elsewhere simply leaves); everything else collapses into the quiet EARLIER list, 50 rows
 * a page. With nothing left, Tokek sleeps where the cards were. Opening an item marks it read.
 */
import { currentAppPath } from '@cp/domain';
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useContext, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useLocale } from '@/lib/i18n/use-locale';
import { openLink } from '@/lib/navigation/open-in-tabs';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { PressScale } from '@/ui/press/PressScale';
import { BackButton } from '@/ui/shell/BackButton';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '@/ui/theme';

import { useOwnerUid } from '../data/session-rows';
import { HOME_ROUTES } from '../routes';
import { useMinuteClock } from '../data/use-home-state';
import { FadeInView } from '../fade-in-view';
import { InboxActionCard } from './action-card';
import { AllCaughtUp } from './all-caught-up';
import { EarlierRow } from './earlier-row';
import { FilterTabs, type InboxFilter } from './filter-tabs';
import { EARLIER_PAGE, isExpired, splitInbox, useInboxItems, type InboxItem } from './inbox-data';
import { inboxRenderer, registerHomeInboxRenderers } from './kind-renderers';
import { useAppBadge } from './use-app-badge';
import { useInboxActions } from './use-inbox-actions';

registerHomeInboxRenderers();

/* eslint-disable lingui/no-unlocalized-strings -- filter values, not copy. */
const NEEDS_YOU: InboxFilter = 'needs_you';
/* eslint-enable lingui/no-unlocalized-strings */

/** How long the last card's exit plays before Tokek's empty state fades in. */
export const EMPTY_AFTER_MS = 380;

const useStyles = makeStyles((t) => ({
  content: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['32'], gap: t.space['16'] },
  header: { gap: t.space['12'] },
  // The back arrow's 44 pt target is centred on the arrow; pull it so the arrow meets the gutter.
  back: { alignSelf: 'flex-start', marginStart: -t.space['12'], marginBottom: -t.space['8'] },
  title: { flexShrink: 0 },
  markAll: {
    flexShrink: 1,
    minHeight: MIN_TOUCH_TARGET,
    justifyContent: 'center',
    paddingVertical: t.space['4'],
  },
}));

function matches(item: InboxItem, filter: InboxFilter): boolean {
  if (filter === 'crew') return item.source === 'crew';
  if (filter === 'guides') return item.source === 'guide';
  return true;
}

/** The inbox waits for the session's local database, like Home. */
export function InboxScreen() {
  const localFirst = useContext(LocalFirstContext);
  const { t } = useLingui();
  if (localFirst === null) {
    return (
      <Scaffold variant="dark" testID="inbox-screen">
        <Skeleton
          preset="list"
          repeat={4}
          label={t({ id: 'home.inbox.loading', message: 'Loading your inbox' })}
        />
      </Scaffold>
    );
  }
  return <InboxContent />;
}

function InboxContent() {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t, i18n } = useLingui();
  const uid = useOwnerUid();
  const minute = useMinuteClock();
  const now = new Date(minute);
  const [limit, setLimit] = useState(EARLIER_PAGE);
  const { items, loaded } = useInboxItems(uid, limit);
  const actions = useInboxActions();
  const unread = items.some((item) => !item.read);
  const lists = useMemo(() => splitInbox(items, new Date(minute), limit), [items, minute, limit]);
  const cards = [...lists.cards, ...actions.leaving.values()]
    .filter((item, index, all) => all.findIndex((other) => other.id === item.id) === index)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const needsYou = cards.filter(
    (item) => !actions.leaving.has(item.id) && !isExpired(item, now),
  ).length;
  useAppBadge(needsYou, loaded);
  const [filter, setFilter] = useState<InboxFilter | null>(null);
  // NEEDS YOU is home: with nothing needing the user it is 3b-5, Tokek asleep over EARLIER.
  const active: InboxFilter = filter ?? NEEDS_YOU;
  const ctx = { i18n, now };

  const open = (item: InboxItem) => {
    actions.markRead(item);
    // Rows filed earlier name the trip hub and its day by their former paths.
    // A row about a trip, the wallet or the pass opens in the tabs under the inbox, not over it.
    if (item.deepLink !== null) openLink(currentAppPath(item.deepLink));
  };

  const shownCards = cards.filter((item) => matches(item, active));
  const shownEarlier = lists.earlier.filter((item) => matches(item, active));
  const caughtUp = shownCards.length === 0 && (active === 'needs_you' || shownEarlier.length === 0);

  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="inbox-screen">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.back}>
          <BackButton fallback={HOME_ROUTES.home} testID="inbox-back" />
        </View>
        <Row justify="space-between" align="flex-end" style={styles.header}>
          {/* A short title at its full size: fitting it to the row measures it before the row has
              a width on iOS, and draws it at the floor size. */}
          <Text
            variant="displayXl"
            autoFit={false}
            numberOfLines={1}
            accessibilityRole="header"
            style={styles.title}
          >
            {upper(t({ id: 'home.inbox.title', message: 'Inbox' }), locale)}
          </Text>
          {/* 3b-4 sets this as a quiet text action, not a pill. It shows while something is unread. */}
          {unread ? (
            <PressScale
              testID="inbox-mark-all-read"
              accessibilityLabel={t({ id: 'home.inbox.markAll', message: 'Mark all read' })}
              onPress={() => void actions.markAllRead(needsYou)}
              style={styles.markAll}
            >
              <Text variant="eyebrow" color={theme.semantic.text.secondary}>
                {upper(t({ id: 'home.inbox.markAll', message: 'Mark all read' }), locale)}
              </Text>
            </PressScale>
          ) : null}
        </Row>
        <FilterTabs value={active} needsYou={needsYou} onChange={setFilter} />
        {!loaded ? (
          <Skeleton
            preset="list"
            repeat={4}
            label={t({ id: 'home.inbox.loading', message: 'Loading your inbox' })}
          />
        ) : (
          <>
            {shownCards.length > 0 ? (
              <Stack gap="12">
                {shownCards.map((item) => (
                  <InboxActionCard
                    key={item.id}
                    item={item}
                    renderer={inboxRenderer(item.kind)}
                    ctx={ctx}
                    expired={isExpired(item, now)}
                    handled={actions.leaving.has(item.id)}
                    onAction={(card, action) => void actions.act(card, action)}
                    onDismissed={actions.settle}
                  />
                ))}
              </Stack>
            ) : caughtUp ? (
              <FadeInView key={active} delayMs={EMPTY_AFTER_MS}>
                {active === 'crew' || active === 'guides' ? (
                  <Text
                    variant="body"
                    color={theme.semantic.text.secondary}
                    testID="inbox-filter-empty"
                  >
                    {active === 'crew'
                      ? t({ id: 'home.inbox.crewEmpty', message: 'Nothing from the crew yet.' })
                      : t({
                          id: 'home.inbox.guidesEmpty',
                          message: 'Nothing from the guides yet.',
                        })}
                  </Text>
                ) : (
                  <AllCaughtUp />
                )}
              </FadeInView>
            ) : null}
            {shownEarlier.length > 0 ? (
              <View>
                <Text variant="eyebrow" color={theme.semantic.text.secondary}>
                  {upper(t({ id: 'home.inbox.earlier', message: 'Earlier' }), locale)}
                </Text>
                {shownEarlier.map((item) => (
                  <EarlierRow
                    key={item.id}
                    item={item}
                    renderer={inboxRenderer(item.kind)}
                    ctx={ctx}
                    onUndo={(row, action) => void actions.act(row, action)}
                    onOpen={open}
                  />
                ))}
                {lists.more ? (
                  <InlineAction
                    testID="inbox-more"
                    kind="ghost"
                    label={t({ id: 'home.inbox.more', message: 'Show older' })}
                    onPress={() => setLimit((current) => current + EARLIER_PAGE)}
                  />
                ) : null}
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </Scaffold>
  );
}
