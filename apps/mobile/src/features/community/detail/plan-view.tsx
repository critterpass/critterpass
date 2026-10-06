/**
 * A published shared plan (3o-2) once read: the hero with ♡ SAVE, the chips and the guide's
 * overlap note, DAY BY DAY with "+", the crew's tips, and the sticky copy buttons.
 */
import type { SharedPlanDetail, SharedPlanProjection } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useCommand } from '@/data/commands/use-command';
import { useLocale } from '@/lib/i18n/use-locale';
import { hrefFor } from '@/lib/navigation/screen-registry';
import { toast } from '@/motion/island-toast';
import { guideSticker } from '@/ui/avatar/guides';
import { IconButton } from '@/ui/buttons/IconButton';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Card } from '@/ui/cards/Card';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { dataOf, useGuideNote, useTripSharedPlan } from '../api';
import {
  copySharedPlan,
  reportContent,
  saveSharedPlan,
  suggestSharedPlan,
  unsaveSharedPlan,
} from '../commands';
import { costEach, crewName, daysLabel, planTitle, ratingLabel, travelMonth } from '../copy';
import { DRAFT_REVIEW_SCREEN, planReport, toastIds } from '../ids';
import { noteLine } from './note-copy';

const SHOWN_DAYS = 3;

const useStyles = makeStyles((th) => ({
  content: { paddingHorizontal: th.size.gutter, gap: th.space['16'] },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  day: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['12'],
    paddingVertical: th.space['8'],
  },
  dayNo: {
    width: 32,
    height: 32,
    borderRadius: th.radius.sm,
    backgroundColor: th.color.orange,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: { flexDirection: 'row', gap: th.space['10'], paddingHorizontal: th.size.gutter },
  grow: { flex: 1 },
}));

export function PlanView({
  detail,
  projection,
  tripId,
  onChanged,
}: {
  detail: SharedPlanDetail;
  projection: SharedPlanProjection;
  tripId: string | null;
  onChanged: () => void;
}) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const locale = useLocale();
  const card = detail.card;
  const [saved, setSaved] = useState(detail.saved);
  const [allDays, setAllDays] = useState(false);
  const note = dataOf(useGuideNote(card.id, tripId).state);
  const trip = dataOf(useTripSharedPlan(tripId ?? '').state);
  const organiser = tripId !== null && trip?.organiser === true;
  const { send: save } = useCommand(saveSharedPlan);
  const { send: unsave } = useCommand(unsaveSharedPlan);
  const { send: copy, pending: copying } = useCommand(copySharedPlan);
  const { send: suggest } = useCommand(suggestSharedPlan);
  const { send: report } = useCommand(reportContent);
  const guide = guideSticker(null);
  const bestDay = note?.best_day ?? null;
  const days = allDays ? projection.days : projection.days.slice(0, SHOWN_DAYS);
  const hidden = projection.days.length - days.length;

  const toggleSave = () => {
    const next = !saved;
    setSaved(next);
    void (next ? save : unsave)({ shared_plan_id: card.id });
  };
  const take = async (dayNos?: number[]) => {
    if (tripId === null) {
      toast.show({
        id: toastIds.noTrip(card.id),
        title: t({
          id: 'community.detail.noTrip',
          message: 'Open this from one of your trips to copy it.',
        }),
      });
      return;
    }
    const payload =
      dayNos === undefined
        ? { shared_plan_id: card.id, trip_id: tripId }
        : { shared_plan_id: card.id, trip_id: tripId, days: dayNos };
    if (!organiser) {
      await suggest(payload);
      toast.show({
        id: toastIds.suggested(card.id),
        title: t({ id: 'community.detail.suggested', message: 'Sent to your organiser.' }),
      });
      return;
    }
    const result = await copy(payload);
    if (result.kind === 'applied') {
      const places = (result.result as { places?: number }).places ?? 0;
      const name = guide.name;
      toast.show({
        id: toastIds.copied(card.id),
        title: t({
          id: 'community.detail.copied',
          message: `${name} is fitting ${places} places into your draft. Only you can see it.`,
        }),
      });
      onChanged();
      const href = hrefFor(DRAFT_REVIEW_SCREEN, { tripId });
      if (href !== undefined) router.push(href);
    } else {
      toast.show({
        id: toastIds.copyFailed(card.id),
        title: t({
          id: 'community.detail.copyFailed',
          message: "That didn't go through. Try again in a moment.",
        }),
      });
    }
  };

  const month = travelMonth(card, locale);
  const cost = costEach(card, locale);
  return (
    <Scaffold testID="shared-plan">
      <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
        <Card tone="orange" halftone radius="cardBig" testID="shared-plan-hero">
          <Stack gap="10" style={{ paddingTop: theme.space['12'] }}>
            <View style={styles.head}>
              <BackEyebrow label={t({ id: 'community.back.plans', message: 'Crew plans' })} />
              <PillButton
                size="sm"
                tone="ink"
                label={
                  saved
                    ? t({ id: 'community.detail.saved', message: '♥ Saved' })
                    : t({ id: 'community.detail.save', message: '♡ Save' })
                }
                onPress={toggleSave}
                testID="shared-plan-save"
              />
            </View>
            <Text variant="eyebrow">
              {[crewName(card), month].filter((part) => part !== null).join(' · ')}
            </Text>
            <Text variant="displayXl" accessibilityRole="header">
              {planTitle(card).toUpperCase()}
            </Text>
            <Row gap="6" wrap>
              <InfoPill>{daysLabel(card.days_count)}</InfoPill>
              {cost === null ? null : <InfoPill>{cost}</InfoPill>}
              <InfoPill>{ratingLabel(card)}</InfoPill>
            </Row>
            {note === null ? null : (
              <Text variant="voice" testID="shared-plan-note">
                {noteLine(note)}
              </Text>
            )}
            {card.travelled ? null : (
              <Text variant="caption">
                {t({ id: 'community.notTravelled', message: 'Planned, not travelled yet' })}
              </Text>
            )}
          </Stack>
        </Card>
        <Stack gap="12" style={[styles.content, { paddingTop: theme.space['16'] }]}>
          <View style={styles.head}>
            <Text variant="eyebrow">
              {t({ id: 'community.detail.dayByDay', message: 'Day by day' })}
            </Text>
            <Text variant="caption">
              {t({ id: 'community.detail.addsOne', message: '+ adds one day' })}
            </Text>
          </View>
          <Card tone="raised">
            {days.map((day) => (
              <View key={day.day_no} style={styles.day} testID={`shared-plan-day-${day.day_no}`}>
                <View style={styles.dayNo}>
                  <Text variant="label">{String(day.day_no)}</Text>
                </View>
                <View style={styles.grow}>
                  <Text variant="rowTitle" numberOfLines={1}>
                    {(day.theme ?? day.places[0]?.name ?? '').toUpperCase()}
                  </Text>
                  <Text variant="bodySm" numberOfLines={1}>
                    {day.places.map((place) => place.name).join(' · ')}
                  </Text>
                </View>
                <IconButton
                  label={t({ id: 'community.detail.addDay', message: `Add day ${day.day_no}` })}
                  glyph={<Text variant="title">+</Text>}
                  onPress={() => void take([day.day_no])}
                  testID={`shared-plan-add-${day.day_no}`}
                />
              </View>
            ))}
            {hidden > 0 ? (
              <TextLink
                label={t({ id: 'community.detail.moreDays', message: `+ ${hidden} more days` })}
                onPress={() => setAllDays(true)}
                testID="shared-plan-more-days"
              />
            ) : null}
          </Card>
          {projection.tips.length === 0 ? null : (
            <Stack gap="8">
              <Text variant="eyebrow">
                {t({ id: 'community.detail.tips', message: "What they'd change" })}
              </Text>
              {projection.tips.map((tip, index) => (
                <Card key={`${tip.poi_id}-${index}`} tone="raised">
                  <Text variant="voice">{tip.text}</Text>
                </Card>
              ))}
            </Stack>
          )}
          <TextLink
            label={t({ id: 'community.detail.report', message: 'Report this plan' })}
            onPress={() => {
              void report(planReport(card.id));
              toast.show({
                id: toastIds.reported(card.id),
                title: t({
                  id: 'community.detail.reported',
                  message: 'Thanks. We will take a look.',
                }),
              });
            }}
            testID="shared-plan-report"
          />
        </Stack>
      </ScrollView>
      <View
        style={[
          styles.footer,
          { position: 'absolute', bottom: insets.bottom + theme.space['12'], left: 0, right: 0 },
        ]}
      >
        <View style={styles.grow}>
          <PillButton
            block
            tone="yellow"
            loading={copying}
            label={
              organiser || tripId === null
                ? t({ id: 'community.detail.copy', message: 'Copy into our trip' })
                : t({ id: 'community.detail.suggest', message: 'Suggest to organiser' })
            }
            onPress={() => void take()}
            testID="shared-plan-copy"
          />
        </View>
        {bestDay === null ? null : (
          <PillButton
            variant="secondary"
            label={t({ id: 'community.detail.bestDay', message: `Day ${bestDay} only` })}
            onPress={() => void take([bestDay])}
            testID="shared-plan-best-day"
          />
        )}
      </View>
    </Scaffold>
  );
}
