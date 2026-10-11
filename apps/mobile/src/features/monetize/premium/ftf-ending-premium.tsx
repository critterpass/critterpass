/**
 * Free first trip ending (9.21): a split-flap count of the days left, Tokek's note, what is kept
 * for good, what pauses (struck through), and Boost the trip, Pass+ just for me, or Stay free (a
 * quiet no for this trip). Opened late, after the window closed, it says so and keeps the way back.
 */
import { upper } from '@cp/i18n';
import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { useLocale } from '@/lib/i18n/use-locale';
import {
  Button,
  EmptyState,
  GuideNote,
  LoadingCritter,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';
import { PushScreen } from '@/ui/premium/shell';

import { useFtfEndingCopy } from '../ftf-ending/ftf-ending-copy';
import { FTF_KEPT, FTF_PAUSED } from '../ftf-ending/ftf-ending-model';
import { useFtfEndingActions } from '../ftf-ending/use-ftf-ending-actions';
import { useFtfEnding } from '../ftf-ending/use-ftf-ending';
import { usePlanDate } from '../plan/plan-copy';
import { PerkChip } from './components/perk-chip';
import { SplitFlapDigit } from './components/split-flap-digit';

export function FtfEndingPremium() {
  const th = usePremiumTheme();
  const locale = useLocale();
  const params = useLocalSearchParams<{ tripId?: string }>();
  const tripId = typeof params.tripId === 'string' ? params.tripId : '';
  const { loaded, ending } = useFtfEnding(tripId);
  const actions = useFtfEndingActions(tripId);
  const copy = useFtfEndingCopy();
  const planDate = usePlanDate();

  if (!loaded) {
    return (
      <PushScreen title={copy.title} backLabel={copy.title} testID="ftf-ending-loading">
        <LoadingCritter label={copy.title} />
      </PushScreen>
    );
  }
  if (ending === null) {
    return (
      <PushScreen title={copy.title} backLabel={copy.title} testID="ftf-ending">
        <View testID="ftf-ending-ended">
          <EmptyState
            title={copy.ended}
            line={copy.endedLine}
            action={
              <Button
                label={copy.title}
                variant="secondary"
                onPress={actions.onBack}
                testID="ftf-ending-back"
              />
            }
          />
        </View>
      </PushScreen>
    );
  }
  const date = planDate(ending.endsAt.toISOString()) ?? '';
  return (
    <PushScreen title={copy.title} backLabel={copy.title} testID="ftf-ending">
      <View
        style={{
          paddingHorizontal: th.space.gutter,
          gap: th.space.gap16,
          paddingTop: th.space.gap8,
        }}
      >
        <View style={styles.count}>
          <SplitFlapDigit
            glyph={String(ending.daysLeft)}
            width={120}
            height={150}
            testID="ftf-ending-days"
          />
          <View style={styles.flex}>
            <Text variant="title" style={styles.heavy} accessibilityRole="header">
              {copy.daysLeft}
            </Text>
            <Text variant="caption" tone="muted">
              {copy.pauses(date)}
            </Text>
          </View>
        </View>
        <GuideNote name="Tokek" text={copy.guideNote} />
        <View style={{ gap: 8 }}>
          <Text variant="badge" color={th.color.status.booked.text} style={styles.eyebrow}>
            {upper(copy.keptLabel, locale)}
          </Text>
          <View style={styles.chips}>
            {FTF_KEPT.map((key) => (
              <PerkChip key={key} label={copy.kept[key]} color={th.accent.mint} mark="tick" kept />
            ))}
          </View>
        </View>
        <View style={{ gap: 8 }}>
          <Text variant="badge" tone="placeholder" style={styles.eyebrow}>
            {upper(copy.pausedLabel(date), locale)}
          </Text>
          <View style={styles.chips}>
            {FTF_PAUSED.map((key) => (
              <PerkChip key={key} label={copy.paused[key]} color={th.color.placeholder} paused />
            ))}
          </View>
        </View>
        <View style={{ gap: 8, marginTop: 8 }}>
          <Button
            label={copy.boost(ending.place)}
            onPress={actions.onBoost}
            testID="ftf-ending-boost"
          />
          <Button
            label={copy.passPlus}
            variant="secondary"
            onPress={actions.onPassPlus}
            testID="ftf-ending-pass-plus"
          />
          <View style={{ alignItems: 'center' }}>
            <TextButton
              label={copy.stayFree}
              onPress={actions.onStayFree}
              testID="ftf-ending-stay-free"
            />
          </View>
        </View>
      </View>
    </PushScreen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, gap: 4 },
  heavy: { fontWeight: '800' },
  count: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  eyebrow: { fontWeight: '800', letterSpacing: 1.1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
});
