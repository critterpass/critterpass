/**
 * The premium inbox (3.17, 3.18): a push from Home's bell (the tab bar steps away). "Mark all
 * read" is the one header action. The filter opens on "Needs you"; its cards are answered in
 * place and fold away; everything else is the quiet "Earlier" list, paged. Nothing yet is the
 * first-time page; nothing left is Tokek asleep. Notification settings sit at the foot.
 */
/* eslint-disable lingui/no-unlocalized-strings -- filter values, route paths and SF Symbols. */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useContext } from 'react';
import { View } from 'react-native';

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
import { PushScreen, type ShellAction } from '@/ui/premium/shell';

import type { InboxFilter } from '../../inbox/filter-tabs';
import { isExpired } from '../../inbox/inbox-data';
import { inboxRenderer, registerHomeInboxRenderers } from '../../inbox/kind-renderers';
import { useInbox } from '../../inbox/use-inbox';
import { PremiumEarlierRow } from './earlier-row';
import { InboxFirstTime } from './inbox-first-time';
import { PremiumInboxCard } from './inbox-card';

registerHomeInboxRenderers();

const useStyles = makePremiumStyles((t) => ({
  content: { paddingHorizontal: t.space.gutter, paddingTop: t.space.gap8, gap: t.space.gap12 },
  cards: { gap: t.space.gap10 },
  label: { marginTop: t.space.gap8, marginStart: 6 },
  loading: { gap: t.space.gap10 },
}));

export function InboxPremiumScreen() {
  const localFirst = useContext(LocalFirstContext);
  const { t } = useLingui();
  const styles = useStyles();
  const title = t({ id: 'home.inbox.title', message: 'Inbox' });
  const back = t({ id: 'home.premium.backLabel', message: 'Home' });
  if (localFirst === null) {
    return (
      <PushScreen title={title} backLabel={back} testID="inbox-screen">
        <View style={[styles.content, styles.loading]}>
          <Skeleton height={120} radius={22} tone="block" />
          <Skeleton height={120} radius={22} tone="block" />
        </View>
      </PushScreen>
    );
  }
  return <InboxContent title={title} back={back} />;
}

function InboxContent({ title, back }: { readonly title: string; readonly back: string }) {
  const styles = useStyles();
  const { t } = useLingui();
  const inbox = useInbox();
  const { actions, ctx, now } = inbox;
  const markAll: ShellAction = {
    key: 'mark-all',
    label: t({ id: 'home.inbox.markAll', message: 'Mark all read' }),
    sfSymbol: 'checkmark.circle',
    glyph: 'check',
    onPress: () => void actions.markAllRead(inbox.needsYou),
    testID: 'inbox-mark-all-read',
  };
  const firstTime = inbox.loaded && inbox.total === 0;
  const needs = inbox.needsYou;
  return (
    <PushScreen
      title={title}
      backLabel={back}
      {...(inbox.unread && !firstTime ? { action: markAll } : {})}
      testID="inbox-screen"
    >
      <View style={styles.content}>
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
                  label: t({ id: 'home.inbox.needsYou', message: `Needs you · ${needs}` }),
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
                    : t({ id: 'home.inbox.guidesEmpty', message: 'Nothing from the guides yet.' })}
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
      </View>
    </PushScreen>
  );
}
