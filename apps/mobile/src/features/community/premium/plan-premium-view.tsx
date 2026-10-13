/**
 * A published shared plan once read, premium: pushed with the glass back and a heart in the bar
 * (Save), the plan's title, chips and the guide's overlap note, Day by day with "+", the crew's
 * tips, Report, and the copy buttons riding the bottom. Only an organiser copies; anyone else
 * suggests it to them. A plan opened outside a trip asks which trip first.
 */
import type { SharedPlanDetail, SharedPlanProjection } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/premium/stickers/guides';
import {
  Button,
  Card,
  enterTransition,
  GuideNote,
  StatusTag,
  Text,
  TextButton,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';
import { confirmAlert, PushScreen } from '@/ui/premium/shell';

import { costEach, crewName, daysLabel, planTitle, ratingLabel, travelMonth } from '../copy';
import { noteLine } from '../detail/note-copy';
import { usePlanView } from '../detail/use-plan-view';
import { PlanDaysPremium } from './plan-days-premium';
import { TripPickerPremium } from './trip-picker-premium';

export function PlanPremiumView({
  detail,
  projection,
  tripId,
  backLabel,
  onChanged,
}: {
  readonly detail: SharedPlanDetail;
  readonly projection: SharedPlanProjection;
  readonly tripId: string | null;
  readonly backLabel: string;
  readonly onChanged: () => void;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const locale = useLocale();
  const insets = useSafeAreaInsets();
  const reduced = usePremiumReducedMotion();
  const plan = usePlanView({ detail, tripId, onChanged });
  const { card, target, bestDay, blocked } = plan;
  const guide = guideSticker(null);
  const month = travelMonth(card, locale);
  const cost = costEach(card, locale);
  const askReport = () =>
    void confirmAlert({
      title: t({ id: 'community.report.title', message: 'Report this plan?' }),
      message: t({
        id: 'community.report.line',
        message: 'Our team looks at it. The crew who shared it is not told who reported.',
      }),
      confirm: t({ id: 'community.report.confirm', message: 'Report' }),
      cancel: t({ id: 'common.cancel', message: 'Cancel' }),
    }).then((yes) => {
      if (yes) plan.fileReport();
    });

  return (
    <PushScreen
      title={planTitle(card)}
      backLabel={backLabel}
      scroll={false}
      action={{
        key: plan.saved ? 'saved' : 'save',
        label: plan.saved
          ? t({ id: 'community.detail.savedPlain', message: 'Saved' })
          : t({ id: 'community.detail.savePlain', message: 'Save' }),
        // eslint-disable-next-line lingui/no-unlocalized-strings -- SF Symbol names, never copy.
        sfSymbol: plan.saved ? 'heart.fill' : 'heart',
        glyph: 'heart',
        onPress: plan.toggleSave,
        testID: 'shared-plan-save',
      }}
      testID="shared-plan"
    >
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{
          paddingHorizontal: th.space.gutter,
          paddingBottom: th.space.gap16,
          gap: th.space.gap16,
        }}
      >
        <Animated.View
          entering={enterTransition(reduced)}
          style={{ gap: th.space.gap10 }}
          testID="shared-plan-hero"
        >
          <Text variant="label" tone="muted">
            {[crewName(card), month].filter((part) => part !== null).join(' · ')}
          </Text>
          <Text variant="largeTitle" accessibilityRole="header">
            {planTitle(card)}
          </Text>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: th.space.gap6 }}>
            <StatusTag tone="unopened" label={daysLabel(card.days_count)} />
            {cost === null ? null : <StatusTag tone="booked" label={cost} />}
            <StatusTag tone="maybe" label={ratingLabel(card)} />
          </View>
          {card.travelled ? null : (
            <Text variant="caption" tone="muted">
              {t({ id: 'community.notTravelled', message: 'Planned, not travelled yet' })}
            </Text>
          )}
        </Animated.View>
        {plan.note === null ? null : (
          <GuideNote name={guide.name} text={noteLine(plan.note)} testID="shared-plan-note" />
        )}
        <PlanDaysPremium
          days={projection.days}
          canAdd={target !== null}
          disabled={blocked}
          onAdd={(dayNo) => plan.take([dayNo])}
        />
        {projection.tips.length === 0 ? null : (
          <View style={{ gap: th.space.gap8 }}>
            <Text variant="headline" accessibilityRole="header">
              {t({ id: 'community.detail.tips', message: "What they'd change" })}
            </Text>
            {projection.tips.map((tip, index) => (
              <Card key={`${tip.poi_id}-${index}`} padded>
                <Text variant="guide" tone="inkSecondary">
                  {tip.text}
                </Text>
              </Card>
            ))}
          </View>
        )}
        <TextButton
          label={
            plan.reported
              ? t({ id: 'community.detail.reportedLabel', message: 'Reported' })
              : t({ id: 'community.detail.report', message: 'Report this plan' })
          }
          tone="muted"
          disabled={plan.reported}
          onPress={askReport}
          testID="shared-plan-report"
        />
      </ScrollView>
      <View
        style={{
          flexDirection: 'row',
          gap: th.space.gap10,
          paddingHorizontal: th.space.gutter,
          paddingTop: th.space.gap8,
          paddingBottom: Math.max(insets.bottom, th.space.gap12),
        }}
      >
        <View style={{ flex: 1 }}>
          <Button
            loading={plan.taking.busy}
            disabled={blocked}
            label={
              target === null
                ? t({ id: 'community.detail.copyPick', message: 'Copy into a trip' })
                : target.organiser
                  ? t({ id: 'community.detail.copy', message: 'Copy into our trip' })
                  : t({ id: 'community.detail.suggest', message: 'Suggest to organiser' })
            }
            onPress={() => plan.take()}
            testID="shared-plan-copy"
          />
        </View>
        {bestDay === null || target === null ? null : (
          <Button
            variant="secondary"
            disabled={blocked}
            label={t({ id: 'community.detail.bestDay', message: `Day ${bestDay} only` })}
            onPress={() => plan.take([bestDay])}
            testID="shared-plan-best-day"
          />
        )}
      </View>
      {plan.picking ? (
        <TripPickerPremium
          destinationId={projection.destination_id}
          destinationName={projection.destination_name}
          onPick={plan.pick}
          onStart={() => void plan.taking.startTrip(projection.destination_id)}
          onClose={plan.closePicker}
        />
      ) : null}
    </PushScreen>
  );
}
