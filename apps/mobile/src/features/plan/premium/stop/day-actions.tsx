/**
 * What leads the premium stop sheet: on the stop's own day, Go, "I'm here" then "Done here" with
 * since when, "Start from now?" once she is there well before the start, "Running late?" with
 * 15, 30 and 45 minutes, and "Skip it, just me"; and, when the crew's plan moved under a change
 * she made for herself, the clash card with Keep mine / Go with the crew. Check-ins, the late
 * flow and the start-now ops are the current day actions' own.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { View } from 'react-native';

import { minutesOnDay } from '@/data/plan/plan-model';
import { goHref } from '@/features/go';
import { useLocale } from '@/lib/i18n/use-locale';
import { Button, Text, TextButton, usePremiumTheme } from '@/ui/premium';

import { clock } from '../../day/format';
import { LATE_STEPS, saidLateRoute } from '../../day/said-late';
import { startFromNow } from '../../day/start-now';
import { isStopOfToday, type StopDayActions } from '../../day/stop-day-actions';
import { useStopCheckIn } from '../../day/stop-check-in';
import type { ClashCard } from '../../overlay/clash-card';

type DayActionsProps = Parameters<typeof StopDayActions>[0];
type ClashProps = Parameters<typeof ClashCard>[0];

export function PremiumDayActions({
  tripId,
  item,
  date,
  tz,
  onClose,
  onSkipForMe,
  solo = false,
  day,
}: DayActionsProps) {
  const theme = usePremiumTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const { checkIn, state, advance } = useStopCheckIn(tripId, item.stableId, item.poiId);
  if (!isStopOfToday(item, date, tz, new Date())) return null;
  const at = (iso: string) => clock(locale, minutesOnDay(iso, tz, date ?? ''));
  const since =
    checkIn === null
      ? null
      : checkIn.leftAt !== null
        ? t({ id: 'plan.day.stop.doneAt', message: `Done at ${at(checkIn.leftAt)}` })
        : t({ id: 'plan.day.stop.hereSince', message: `Here since ${at(checkIn.arrivedAt)}` });
  const poiId = item.poiId;
  const nowMinutes = date === null ? 0 : minutesOnDay(new Date().toISOString(), tz, date);
  const early =
    state !== 'here' || day === undefined
      ? null
      : startFromNow({ stops: day.stops, stop: item, nowMinutes, slot: day.slot });
  const late = t({ id: 'plan.day.late.label', message: 'Running late?' });
  return (
    <View style={{ gap: theme.space.gap10 }} testID="stop-day-actions">
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: theme.space.gap8 }}>
        {poiId === null || state !== 'ahead' ? null : (
          <Button
            size="small"
            icon="forward"
            label={t({ id: 'plan.premium.stop.go', message: 'Go' })}
            onPress={() => {
              onClose();
              router.push(goHref({ kind: 'place', poiId, tripId }));
            }}
            testID="stop-day-go"
          />
        )}
        {state === 'done' ? null : (
          <Button
            size="small"
            variant="control"
            label={
              state === 'here'
                ? t({ id: 'plan.day.stop.done', message: 'Done here' })
                : t({ id: 'plan.day.stop.here', message: 'I’m here' })
            }
            onPress={advance}
            testID={state === 'here' ? 'stop-day-done' : 'stop-day-here'}
          />
        )}
      </View>
      {since === null ? null : (
        <Text variant="caption" tone="muted" testID="stop-day-since">
          {since}
        </Text>
      )}
      {early === null || day === undefined ? null : (
        <TextButton
          label={t({
            id: 'plan.day.stop.startNow',
            message: `Start from now (${clock(locale, early.start)})?`,
          })}
          onPress={() => {
            day.submit(early.ops);
            onClose();
          }}
          testID="stop-day-start-now"
        />
      )}
      {state !== 'ahead' ? null : (
        <>
          <Text variant="label" tone="muted">
            {late}
          </Text>
          <View style={{ flexDirection: 'row', gap: theme.space.gap6 }} testID="stop-day-late">
            {LATE_STEPS.map((minutes) => {
              const pill = t({ id: 'plan.day.late.minutes', message: `${minutes} min` });
              return (
                <Button
                  key={minutes}
                  size="small"
                  variant="control"
                  label={pill}
                  accessibilityHint={late}
                  onPress={() => {
                    onClose();
                    router.push(saidLateRoute(tripId, item.stableId, minutes));
                  }}
                  testID={`stop-day-late-${minutes}`}
                />
              );
            })}
          </View>
          <TextButton
            label={
              solo
                ? t({ id: 'plan.day.stop.skipSolo', message: 'Skip this stop' })
                : t({ id: 'plan.day.stop.skip', message: 'Skip it, just me' })
            }
            onPress={onSkipForMe}
            testID="stop-day-skip"
          />
        </>
      )}
    </View>
  );
}

export function PremiumClashCard({ clash, label, onKeep, onDrop }: ClashProps) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const pink = theme.color.status.voteOpen;
  return (
    <View
      testID={`plan-clash-${clash.stableId}`}
      style={{ borderRadius: 18, backgroundColor: pink.bg, padding: theme.space.gap12, gap: 6 }}
    >
      <Text variant="rowTitle" color={pink.text}>
        {t({ id: 'plan.overlay.clash.title', message: `${label} clashes with the crew plan` })}
      </Text>
      <Text variant="caption" color={pink.text}>
        {clash.kind === 'removed_by_crew'
          ? t({
              id: 'plan.overlay.clash.removed',
              message: 'The crew took it out of their plan. Keep it just for you, or let it go?',
            })
          : t({
              id: 'plan.overlay.clash.changed',
              message:
                'The crew moved it since you changed it for yourself. Keep yours, or go with theirs?',
            })}
      </Text>
      <View style={{ flexDirection: 'row', gap: theme.space.gap6, marginTop: theme.space.gap4 }}>
        <Button
          size="small"
          label={t({ id: 'plan.overlay.clash.keep', message: 'Keep mine' })}
          onPress={onKeep}
          testID={`plan-clash-keep-${clash.stableId}`}
        />
        <Button
          size="small"
          variant="control"
          label={t({ id: 'plan.overlay.clash.drop', message: 'Go with the crew' })}
          onPress={onDrop}
          testID={`plan-clash-drop-${clash.stableId}`}
        />
      </View>
    </View>
  );
}
