/**
 * Dietary consent first (5.21): what sharing means on a paper card (the flags the crew and guide
 * see, the notes they never do), then Share flags, Not now (back, nothing shared) or keeping it to
 * yourself (the form, not shared).
 */
import { t } from '@lingui/core/macro';
import { ScrollView, View } from 'react-native';

import { Doodle } from '@/features/crew';
import {
  Button,
  CritterSticker,
  Tag,
  Text,
  TextButton,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';
import { useScreenInsets } from '@/ui/premium/shell';

const useStyles = makePremiumStyles((th) => ({
  card: {
    marginHorizontal: 20,
    marginTop: 24,
    padding: 20,
    gap: th.space.gap12,
    borderRadius: 28,
    backgroundColor: th.accent.paper,
    boxShadow: th.shadow.raised,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: th.space.gap10 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: th.space.gap10 },
  notes: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: th.color.outlineEmpty,
  },
  foot: { paddingHorizontal: 20, gap: th.space.gap10, alignItems: 'stretch' },
}));

export function DietaryConsent({
  onShare,
  onNotNow,
  onJustMe,
}: {
  readonly onShare: () => void;
  readonly onNotNow: () => void;
  readonly onJustMe: () => void;
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const insets = useScreenInsets();
  return (
    <View style={{ flex: 1 }} testID="guide-dietary-consent">
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 64, paddingBottom: 24 }}>
        <View style={{ paddingHorizontal: 24, flexDirection: 'row', alignItems: 'flex-start' }}>
          <Text variant="largeTitle" style={{ flex: 1 }}>
            {t({ id: 'guide.dietary.title', message: 'Food and access needs' })}
          </Text>
          <Doodle name="food" color={th.accent.tangerine} size={96} />
        </View>
        <View style={styles.card}>
          <View style={styles.head}>
            <CritterSticker kind="gecko" name="Tokek" size={44} pose="think" />
            <Text variant="headline" style={{ flex: 1 }}>
              {t({
                id: 'guide.dietary.consentTitle',
                message: 'Share flags with your crew and guide?',
              })}
            </Text>
          </View>
          <Text variant="body" tone="inkSecondary">
            {t({
              id: 'guide.dietary.consentBody',
              message:
                'They see only your diet and "no" flags for allergies, so the guide can pick places that work for everyone. Your notes and your avoid list stay with you. You can stop sharing any time, and the flags are deleted.',
            })}
          </Text>
          <View style={styles.tags} accessibilityElementsHidden>
            <Tag
              label={t({ id: 'guide.dietary.dietVegetarian', message: 'Vegetarian' })}
              color={th.accent.mint}
              rotate={-3}
            />
            <Tag
              label={t({ id: 'guide.premium.dietary.noPeanuts', message: 'No peanuts' })}
              color={th.accent.pink}
              rotate={3}
            />
            <View style={styles.notes}>
              <Text
                variant="captionMuted"
                tone="placeholder"
                style={{ textDecorationLine: 'line-through' }}
              >
                {t({ id: 'guide.premium.dietary.yourNotes', message: 'your notes' })}
              </Text>
            </View>
          </View>
        </View>
      </ScrollView>
      <View style={[styles.foot, { paddingBottom: insets.bottom + 16 }]}>
        <Button
          label={t({ id: 'guide.dietary.share', message: 'Share flags' })}
          onPress={onShare}
          testID="guide-dietary-consent-yes"
        />
        <Button
          variant="secondary"
          label={t({ id: 'guide.dietary.notNow', message: 'Not now' })}
          onPress={onNotNow}
          testID="guide-dietary-consent-no"
        />
        <TextButton
          label={t({ id: 'guide.premium.dietary.justMe', message: 'Keep it to myself' })}
          onPress={onJustMe}
          testID="guide-dietary-just-me"
        />
      </View>
    </View>
  );
}
