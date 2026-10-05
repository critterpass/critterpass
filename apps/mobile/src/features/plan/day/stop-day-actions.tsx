/**
 * What a stop of today offers first, at the top of its sheet (design in code; logged in
 * docs/undesigned-states.md): GO, "I'm here" then "Done", "Running late?" with 15, 30 and 45
 * minutes, and "Skip it, just me". Nothing is shown for a stop of another day or one with no time,
 * or with the planning screens off: there the sheet is the planning sheet it always was.
 */
import { toLocalWallTime } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';

import { minutesOnDay, type DayItem } from '@/data/plan/plan-model';
import { goHref } from '@/features/go';
import { useLocale } from '@/lib/i18n/use-locale';
import { usePlanningSwitch } from '@/lib/navigation/planning-switch';
import { GoButton } from '@/ui/buttons/GoButton';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Row } from '@/ui/layout/Row';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import { clock } from './format';

import { LateEntry } from './late-entry';
import { saidLateRoute } from './said-late';
import { useStopCheckIn } from './stop-check-in';

/** The stop is on the trip's own today (in the trip's time zone) and has a time. */
export function isStopOfToday(
  item: Pick<DayItem, 'start'>,
  date: string | null,
  tz: string,
  now: Date,
): boolean {
  return item.start !== null && date !== null && toLocalWallTime(now, tz).date === date;
}

export function StopDayActions({
  tripId,
  item,
  date,
  tz,
  onClose,
  onSkipForMe,
}: {
  readonly tripId: string;
  readonly item: DayItem;
  /** The date of the stop's day ("2026-10-05"). */
  readonly date: string | null;
  readonly tz: string;
  /** Closes the sheet before another screen opens over it. */
  readonly onClose: () => void;
  readonly onSkipForMe: () => void;
}) {
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const { redesign } = usePlanningSwitch();
  const { checkIn, state, advance } = useStopCheckIn(tripId, item.stableId, item.poiId);
  if (!redesign || !isStopOfToday(item, date, tz, new Date())) return null;
  const at = (iso: string) => clock(locale, minutesOnDay(iso, tz, date ?? ''));
  const since =
    checkIn === null
      ? null
      : checkIn.leftAt !== null
        ? t({ id: 'plan.day.stop.doneAt', message: `Done at ${at(checkIn.leftAt)}` })
        : t({ id: 'plan.day.stop.hereSince', message: `Here since ${at(checkIn.arrivedAt)}` });
  const poiId = item.poiId;
  return (
    <Stack gap="12" testID="stop-day-actions">
      <Row gap="8" align="center" wrap>
        {poiId === null || state !== 'ahead' ? null : (
          <GoButton
            onPress={() => {
              onClose();
              router.push(goHref({ kind: 'place', poiId, tripId }));
            }}
            testID="stop-day-go"
          />
        )}
        {state === 'done' ? null : (
          <PillButton
            label={
              state === 'here'
                ? t({ id: 'plan.day.stop.done', message: 'Done here' })
                : t({ id: 'plan.day.stop.here', message: 'I’m here' })
            }
            variant="secondary"
            size="sm"
            onPress={advance}
            testID={state === 'here' ? 'stop-day-done' : 'stop-day-here'}
          />
        )}
      </Row>
      {since === null ? null : (
        <Text variant="bodySm" color={theme.semantic.text.secondary} testID="stop-day-since">
          {since}
        </Text>
      )}
      {state !== 'ahead' ? null : (
        <>
          <LateEntry
            onPick={(minutes) => {
              onClose();
              router.push(saidLateRoute(tripId, item.stableId, minutes));
            }}
            testID="stop-day-late"
          />
          <TextLink
            label={t({ id: 'plan.day.stop.skip', message: 'Skip it, just me' })}
            onPress={onSkipForMe}
            testID="stop-day-skip"
          />
        </>
      )}
    </Stack>
  );
}
