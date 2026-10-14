/**
 * The inbox before anything has arrived (3.18): the All / Crew / Guides filter, three example cards
 * stepping back, the bell sticker, what will land here, and at the foot the one ask that matters:
 * "Allow notifications" (the system prompt), or not now (stay here). A phone that already allows
 * them gets no ask.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { usePermission } from '@/lib/permissions';
import {
  Button,
  SegmentedControl,
  StickerIcon,
  TextButton,
  Text,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';

import { ExampleGhostCard } from '../components/example-ghost-card';

const useStyles = makePremiumStyles((t) => ({
  root: { flex: 1, gap: t.space.gap16 },
  examples: { gap: t.space.gap8 },
  bell: { alignSelf: 'center', marginTop: t.space.gap16 },
  words: { gap: 6, paddingHorizontal: t.space.gap8 },
  grow: { flex: 1 },
}));

export function InboxFirstTime() {
  const styles = useStyles();
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const notifications = usePermission('notifications');
  const granted = notifications.report?.status === 'granted';
  const example = t({ id: 'inbox.premium.example', message: 'Example' });
  // Nothing has arrived under any filter yet; the filter is there as it will be once things land.
  const [filter, setFilter] = useState<'all' | 'crew' | 'guides'>('all');
  return (
    <View style={styles.root} testID="inbox-first-time">
      <SegmentedControl
        options={[
          { value: 'all' as const, label: t({ id: 'home.inbox.all', message: 'All' }) },
          { value: 'crew' as const, label: t({ id: 'home.inbox.crew', message: 'Crew' }) },
          { value: 'guides' as const, label: t({ id: 'home.inbox.guides', message: 'Guides' }) },
        ]}
        value={filter}
        onChange={setFilter}
        accessibilityLabel={t({ id: 'home.inbox.filters', message: 'Show' })}
        testID="inbox-first-filter"
      />
      <View style={styles.examples}>
        <ExampleGhostCard
          step={0}
          glyph="bell"
          tint={theme.color.status.voteOpen}
          title={t({ id: 'inbox.premium.example.vote', message: 'Boat day closes Friday' })}
          line={t({ id: 'inbox.premium.example.voteLine', message: 'Votes you haven’t cast yet' })}
          exampleLabel={example}
        />
        <ExampleGhostCard
          step={1}
          glyph="chat"
          tint={theme.color.banner.guide}
          title={t({ id: 'inbox.premium.example.ask', message: 'Move dinner to 21:00?' })}
          line={t({ id: 'inbox.premium.example.askLine', message: 'Changes that need your yes' })}
          exampleLabel={example}
        />
        <ExampleGhostCard
          step={2}
          glyph="search"
          tint={theme.color.status.rain}
          title={t({ id: 'inbox.premium.example.reply', message: 'Replies due Sep 30' })}
          line={t({ id: 'inbox.premium.example.replyLine', message: 'Who still owes an answer' })}
          exampleLabel={example}
        />
      </View>
      <View
        style={styles.bell}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <StickerIcon name="bell" size={64} tilt={-8} />
      </View>
      <View style={styles.words}>
        <Text variant="emptyTitle" accessibilityRole="header" align="center">
          {t({ id: 'inbox.premium.empty.title', message: 'Nothing here yet' })}
        </Text>
        <Text variant="body" tone="muted" align="center">
          {t({
            id: 'inbox.premium.empty.line',
            message:
              'Votes, yes-or-no questions and nudges from the crew land here, answered right from the card.',
          })}
        </Text>
      </View>
      <View style={styles.grow} />
      {granted ? null : (
        <View>
          <Button
            label={t({ id: 'inbox.premium.allow', message: 'Allow notifications' })}
            onPress={() => void notifications.request('settings')}
            testID="inbox-allow-notifications"
          />
          <TextButton
            align="center"
            label={t({ id: 'inbox.premium.notNow', message: 'Not now — I’ll check in here' })}
            onPress={() => router.back()}
            testID="inbox-not-now"
          />
        </View>
      )}
    </View>
  );
}
