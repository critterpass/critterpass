/**
 * A published shared plan (3o-2) once read: the hero with ♡ SAVE, the chips and the guide's
 * overlap note, DAY BY DAY with "+", the crew's tips, and the sticky copy buttons.
 */
import type { SharedPlanDetail, SharedPlanProjection } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { HOME_FALLBACK } from '@/lib/navigation/back';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Card } from '@/ui/cards/Card';
import { InfoPill } from '@/ui/chips/InfoPill';
import { Icon } from '@/ui/icons/Icon';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { ConfirmSheet } from '@/ui/states/ConfirmSheet';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { costEach, crewName, daysLabel, planTitle, ratingLabel, travelMonth } from '../copy';
import { noteLine } from './note-copy';
import { PlanDays } from './plan-days';
import { TripPicker } from './trip-picker';
import { usePlanView } from './use-plan-view';

const useStyles = makeStyles((th) => ({
  content: { paddingHorizontal: th.size.gutter, gap: th.space['16'] },
  head: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  footer: { flexDirection: 'row', gap: th.space['10'], paddingHorizontal: th.size.gutter },
  grow: { flex: 1 },
}));

export function PlanView({
  detail,
  projection,
  tripId,
  backLabel,
  onChanged,
}: {
  detail: SharedPlanDetail;
  projection: SharedPlanProjection;
  tripId: string | null;
  backLabel: string;
  onChanged: () => void;
}) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const locale = useLocale();
  const [footerHeight, setFooterHeight] = useState(0);
  const {
    card,
    saved,
    note,
    target,
    taking,
    bestDay,
    blocked,
    picking,
    reporting,
    reported,
    toggleSave,
    take,
    fileReport,
    pick,
    closePicker,
    askReport,
    cancelReport,
  } = usePlanView({ detail, tripId, onChanged });
  const month = travelMonth(card, locale);
  const cost = costEach(card, locale);
  return (
    <Scaffold testID="shared-plan">
      <ScrollView contentContainerStyle={{ paddingBottom: footerHeight + theme.space['24'] }}>
        <Card tone="orange" halftone radius="cardBig" testID="shared-plan-hero">
          <Stack gap="10" style={{ paddingTop: theme.space['12'] }}>
            <View style={styles.head}>
              <BackEyebrow label={backLabel} fallback={HOME_FALLBACK} />
              <PillButton
                size="sm"
                tone="ink"
                label={
                  saved
                    ? t({ id: 'community.detail.savedPlain', message: 'Saved' })
                    : t({ id: 'community.detail.savePlain', message: 'Save' })
                }
                leading={
                  <Icon
                    name="heart"
                    size={16}
                    color={saved ? theme.color.pink : theme.semantic.text.primary}
                    decorative
                  />
                }
                onPress={toggleSave}
                testID="shared-plan-save"
              />
            </View>
            <Text variant="eyebrow">
              {[crewName(card), month].filter((part) => part !== null).join(' · ')}
            </Text>
            <Text variant="displayXl" accessibilityRole="header">
              {planTitle(card)}
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
          <PlanDays
            days={projection.days}
            canAdd={target !== null}
            disabled={blocked}
            onAdd={(dayNo) => take([dayNo])}
          />
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
            label={
              reported
                ? t({ id: 'community.detail.reportedLabel', message: 'Reported' })
                : t({ id: 'community.detail.report', message: 'Report this plan' })
            }
            disabled={reported}
            onPress={askReport}
            testID="shared-plan-report"
          />
        </Stack>
      </ScrollView>
      <View
        onLayout={(event) => setFooterHeight(event.nativeEvent.layout.height + insets.bottom)}
        style={[
          styles.footer,
          { position: 'absolute', bottom: insets.bottom + theme.space['12'], start: 0, end: 0 },
        ]}
      >
        <View style={styles.grow}>
          <PillButton
            block
            tone="yellow"
            loading={taking.busy}
            disabled={blocked}
            label={
              target === null
                ? t({ id: 'community.detail.copyPick', message: 'Copy into a trip' })
                : target.organiser
                  ? t({ id: 'community.detail.copy', message: 'Copy into our trip' })
                  : t({ id: 'community.detail.suggest', message: 'Suggest to organiser' })
            }
            onPress={() => take()}
            testID="shared-plan-copy"
          />
        </View>
        {bestDay === null || target === null ? null : (
          <PillButton
            variant="secondary"
            disabled={blocked}
            label={t({ id: 'community.detail.bestDay', message: `Day ${bestDay} only` })}
            onPress={() => take([bestDay])}
            testID="shared-plan-best-day"
          />
        )}
      </View>
      {picking ? (
        <TripPicker
          destinationId={projection.destination_id}
          destinationName={projection.destination_name}
          onPick={pick}
          onStart={() => void taking.startTrip(projection.destination_id)}
          onClose={closePicker}
        />
      ) : null}
      {reporting ? (
        <ConfirmSheet
          title={t({ id: 'community.report.title', message: 'Report this plan?' })}
          consequences={[
            t({
              id: 'community.report.line',
              message: 'Our team looks at it. The crew who shared it is not told who reported.',
            }),
          ]}
          confirmLabel={t({ id: 'community.report.confirm', message: 'Report' })}
          mode="button"
          onCancel={cancelReport}
          onConfirm={fileReport}
          testID="shared-plan-report-confirm"
        />
      ) : null}
    </Scaffold>
  );
}
