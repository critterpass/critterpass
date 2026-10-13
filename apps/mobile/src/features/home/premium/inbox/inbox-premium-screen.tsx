/**
 * The premium inbox (3.17, 3.18): a push from Home's bell (the tab bar steps away) under the large
 * "Inbox" title. "Mark all read" is the one header action, a text pill. The filter opens on "Needs you"; its cards are answered in
 * place and fold away; everything else is the quiet "Earlier" list, paged. Nothing yet is the
 * first-time page; nothing left is Tokek asleep. Notification settings sit at the foot.
 */
/* eslint-disable lingui/no-unlocalized-strings -- filter values, route paths and SF Symbols. */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useContext, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import {
  EmptyState,
  ListCard,
  Row,
  SegmentedControl,
  Skeleton,
  Text,
  TextButton,
  makePremiumStyles,
} from '@/ui/premium';
import { RootScreen, type ShellAction } from '@/ui/premium/shell';

import type { InboxFilter } from '../../inbox/inbox-filter';
import { isExpired } from '../../inbox/inbox-data';
import { inboxRenderer, registerHomeInboxRenderers } from '../../inbox/kind-renderers';
import { useInbox } from '../../inbox/use-inbox';
import { PremiumEarlierRow } from './earlier-row';
import { InboxFirstTime } from './inbox-first-time';
import { PremiumInboxCard } from './inbox-card';

registerHomeInboxRenderers();

const useStyles = makePremiumStyles((t) => ({
  content: { paddingHorizontal: t.space.gutter, paddingBottom: t.space.gutter, gap: t.space.gap12 },
  cards: { gap: t.space.gap10 },
  label: { marginTop: t.space.gap8, marginStart: 6 },
  loading: { gap: t.space.gap10 },
}));

export function InboxPremiumScreen() {
  const localFirst = useContext(LocalFirstContext);
  const { t } = useLingui();
  const styles = useStyles();
  const title = t({ id: 'home.inbox.title', message: 'Inbox' });
  if (localFirst === null) {
    return (
      <RootScreen title={title} testID="inbox-screen">
        {({ scrollProps, largeTitle }) => (
          <ScrollView {...scrollProps} contentContainerStyle={styles.content}>
            {largeTitle}
            <View style={styles.loading}>
              <Skeleton height={120} radius={22} tone="block" />
              <Skeleton height={120} radius={22} tone="block" />
            </View>
          </ScrollView>
        )}
      </RootScreen>
    );
  }
  return <InboxContent title={title} />;
}

function InboxContent({ title }: { readonly title: string }) {
  const styles = useStyles();
  const { t } = useLingui();
  const inbox = useInbox();
  const { actions, ctx, now } = inbox;
  const markAll: ShellAction = {
    key: 'mark-all',
    label: t({ id: 'home.inbox.markAll', message: 'Mark all read' }),
    sfSymbol: 'checkmark.circle',
    glyph: 'check',
    text: true,
    onPress: () => void actions.markAllRead(inbox.needsYou),
    testID: 'inbox-mark-all-read',
  };
  // The first-time page is for an inbox that never held anything: once an item has shown, an
  // empty inbox is Tokek asleep, even after the last card was answered and left.
  const [held, setHeld] = useState(false);
  if (inbox.total > 0 && !held) setHeld(true);
  const firstTime = inbox.loaded && inbox.total === 0 && !held;
  const needs = inbox.needsYou;
  return (
    <RootScreen
      title={title}
      actions={inbox.unread && !firstTime ? [markAll] : []}
      testID="inbox-screen"
    >
      {({ scrollProps, largeTitle }) => (
        <ScrollView {...scrollProps} contentContainerStyle={styles.content}>
          {largeTitle}
          {!inbox.loaded ? (
            <View style={styles.loading}>
              <Skeleton height={120} radius={22} tone="block" />
              <Skeleton height={120} radius={22} tone="block" />
            </View>
          ) : firstTime ? (
            <InboxFirstTime />
          ) : (
            <>
              <SegmentedControl<InboxFilter>
                options={[
                  { value: 'all', label: t({ id: 'home.inbox.all', message: 'All' }) },
                  {
                    value: 'needs_you',
                    label: t({
                      id: 'home.premium.inbox.needsYou',
                      message: `Needs you · ${needs}`,
                    }),
                    weight: 1.4,
                  },
                  { value: 'crew', label: t({ id: 'home.inbox.crew', message: 'Crew' }) },
                  { value: 'guides', label: t({ id: 'home.inbox.guides', message: 'Guides' }) },
                ]}
                value={inbox.filter}
                onChange={inbox.setFilter}
                accessibilityLabel={t({ id: 'home.inbox.filters', message: 'Show' })}
                testID="inbox-filters"
              />
              {inbox.cards.length > 0 ? (
                <>
                  <Text variant="label" tone="muted" style={styles.label}>
                    {t({ id: 'inbox.premium.needsYouLabel', message: 'Needs you' })}
                  </Text>
                  <View style={styles.cards}>
                    {inbox.cards.map((item) => (
                      <PremiumInboxCard
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
                  </View>
                </>
              ) : inbox.caughtUp ? (
                inbox.filter === 'crew' || inbox.filter === 'guides' ? (
                  <Text variant="body" tone="muted" testID="inbox-filter-empty">
                    {inbox.filter === 'crew'
                      ? t({ id: 'home.inbox.crewEmpty', message: 'Nothing from the crew yet.' })
                      : t({
                          id: 'home.inbox.guidesEmpty',
                          message: 'Nothing from the guides yet.',
                        })}
                  </Text>
                ) : (
                  <EmptyState
                    title={t({ id: 'inbox.premium.caughtUp', message: 'All caught up' })}
                    line={t({
                      id: 'inbox.premium.caughtUpLine',
                      message: 'Nothing needs you. Tokek’s having a nap.',
                    })}
                    testID="inbox-caught-up"
                  />
                )
              ) : null}
              {inbox.earlier.length > 0 ? (
                <>
                  <Text variant="label" tone="muted" style={styles.label}>
                    {t({ id: 'home.inbox.earlier', message: 'Earlier' })}
                  </Text>
                  <ListCard earlier>
                    {inbox.earlier.map((item) => (
                      <PremiumEarlierRow
                        key={item.id}
                        item={item}
                        renderer={inboxRenderer(item.kind)}
                        ctx={ctx}
                        onUndo={(row, action) => void actions.act(row, action)}
                        onOpen={inbox.open}
                      />
                    ))}
                  </ListCard>
                  {inbox.more ? (
                    <TextButton
                      label={t({ id: 'home.inbox.more', message: 'Show older' })}
                      onPress={inbox.showMore}
                      testID="inbox-more"
                    />
                  ) : null}
                </>
              ) : null}
              <ListCard>
                <Row
                  title={t({ id: 'inbox.premium.settings', message: 'Notification settings' })}
                  onPress={() => router.push('/you/pings')}
                  testID="inbox-settings"
                />
              </ListCard>
            </>
          )}
        </ScrollView>
      )}
    </RootScreen>
  );
}
