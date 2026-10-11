/**
 * Inbox (3b-4, 3b-5): one place for everything that needs the user, global across crews. Needs-you
 * cards sit on top and slide off once answered (from here, a notification or a widget: an item
 * settled elsewhere simply leaves); everything else collapses into the quiet EARLIER list, 50 rows
 * a page. With nothing left, Tokek sleeps where the cards were. Opening an item marks it read.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { useContext } from 'react';
import { ScrollView, View } from 'react-native';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useLocale } from '@/lib/i18n/use-locale';
import { InlineAction } from '@/ui/buttons/InlineAction';
import { PressScale } from '@/ui/press/PressScale';
import { BackButton } from '@/ui/shell/BackButton';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, MIN_TOUCH_TARGET, useTheme } from '@/ui/theme';

import { HOME_ROUTES } from '../routes';
import { FadeInView } from '../fade-in-view';
import { InboxActionCard } from './action-card';
import { AllCaughtUp } from './all-caught-up';
import { EarlierRow } from './earlier-row';
import { FilterTabs } from './filter-tabs';
import { isExpired } from './inbox-data';
import { inboxRenderer, registerHomeInboxRenderers } from './kind-renderers';
import { useInbox } from './use-inbox';

registerHomeInboxRenderers();

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
  const { t } = useLingui();
  const inbox = useInbox();
  const { actions, now, ctx, needsYou, unread } = inbox;
  const active = inbox.filter;
  const setFilter = inbox.setFilter;
  const open = inbox.open;
  const shownCards = inbox.cards;
  const shownEarlier = inbox.earlier;
  const caughtUp = inbox.caughtUp;
  const loaded = inbox.loaded;
  const lists = { more: inbox.more };

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
                    onPress={inbox.showMore}
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
