/**
 * The inbox before anything has arrived (3.18): three example cards stepping back, the bell, what
 * will land here, and the one ask that matters: "Allow notifications" (the system prompt), or not
 * now (stay here). A phone that already allows them gets no ask.
 */
/* eslint-disable lingui/no-unlocalized-strings -- transform values, never copy. */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { View } from 'react-native';

import { usePermission } from '@/lib/permissions';
import { Button, TextButton, Text, makePremiumStyles, usePremiumTheme } from '@/ui/premium';

import { ExampleGhostCard } from '../components/example-ghost-card';
import { HomeGlyph } from '../components/home-glyph';

const useStyles = makePremiumStyles((t) => ({
  root: { gap: t.space.gap16 },
  examples: { gap: t.space.gap8 },
  bell: {
    alignSelf: 'center',
    width: 92,
    height: 92,
    borderRadius: 46,
    backgroundColor: t.color.banner.guide.bg,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: t.space.gap16,
    transform: [{ rotate: '-8deg' }],
  },
  words: { gap: 6, paddingHorizontal: t.space.gap8 },
}));

export function InboxFirstTime() {
  const styles = useStyles();
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const notifications = usePermission('notifications');
  const granted = notifications.report?.status === 'granted';
  const example = t({ id: 'inbox.premium.example', message: 'Example' });
  return (
    <View style={styles.root} testID="inbox-first-time">
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
        <HomeGlyph name="bell" size={52} color={theme.color.banner.guide.text} stroke={2.2} />
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
