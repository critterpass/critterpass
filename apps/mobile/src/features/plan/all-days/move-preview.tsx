/**
 * Before a stop moves to another day (7b-3): both days rerouted, each with its stops and time in
 * the car before and after, then MOVE IT (an organiser) or SUGGEST IT (a member, as a change set).
 * A move the target day can't take says why instead. "Move a stop" is the same move without a
 * drag: pick one of the day's stops, then the day it goes to.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { View } from 'react-native';

import type { DayItem } from '@/data/plan/plan-model';
import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { DayChips } from '@/ui/planning';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { refusalLine } from '../day-plan/refusal';
import { lengthLabel } from '../trip-map/format';
import { dayChips } from '../trip-map/sheet-copy';
import type { TripDay } from '../trip-map/trip-days';
import type { DayAfter, MovePlan } from './use-cross-day-drag';

const useStyles = makeStyles((t) => ({
  body: { paddingHorizontal: t.size.gutter, paddingBottom: t.space['24'], gap: t.space['14'] },
  day: {
    padding: t.space['12'],
    borderRadius: t.radius.lg,
    backgroundColor: t.semantic.bg.raised,
    gap: t.space['4'],
  },
  stops: { flexDirection: 'row', flexWrap: 'wrap', gap: t.space['8'] },
}));

function DayChange({ change }: { readonly change: DayAfter }) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const n = change.day.dayNo;
  const title = change.day.theme ?? t({ id: 'plan.allDays.dayTitle', message: `Day ${n}` });
  const before = lengthLabel(change.before.roadMinutes);
  const after = lengthLabel(change.after.roadMinutes);
  return (
    <View style={styles.day} testID={`move-preview-day-${String(n)}`}>
      <Text variant="label" color={change.day.color}>
        {`${String(n)} · ${title}`}
      </Text>
      <Text variant="body">
        {change.after.stops.length === 0
          ? t({ id: 'plan.allDays.preview.empty', message: 'Nothing left on this day' })
          : change.after.stops.map((stop) => stop.title).join(' · ')}
      </Text>
      <Text variant="bodySm" color={theme.semantic.text.secondary}>
        {t({ id: 'plan.allDays.preview.road', message: `In the car: about ${before} → ${after}` })}
      </Text>
    </View>
  );
}

export function MovePreview({
  stop,
  plan,
  canApply,
  onConfirm,
  onClose,
}: {
  readonly stop: DayItem;
  readonly plan: MovePlan;
  readonly canApply: boolean;
  readonly onConfirm: () => void;
  readonly onClose: () => void;
}) {
  const { t } = useLingui();
  const styles = useStyles();
  const name = stop.title;
  return (
    <Sheet
      detents={['fit']}
      title={t({ id: 'plan.allDays.preview.title', message: `Move ${name}?` })}
      onDismiss={onClose}
      testID="move-preview"
    >
      <View style={styles.body}>
        {plan.ok ? (
          <>
            <DayChange change={plan.from} />
            <DayChange change={plan.to} />
            <PillButton
              label={
                canApply
                  ? t({ id: 'plan.allDays.preview.move', message: 'Move it' })
                  : t({ id: 'plan.allDays.preview.suggest', message: 'Suggest it to the crew' })
              }
              block
              onPress={onConfirm}
              testID="move-preview-confirm"
            />
          </>
        ) : (
          <>
            <Text variant="body">{refusalLine(plan.refusal)}</Text>
            <PillButton
              label={t({ id: 'plan.allDays.preview.ok', message: 'OK' })}
              variant="secondary"
              block
              onPress={onClose}
              testID="move-preview-ok"
            />
          </>
        )}
      </View>
    </Sheet>
  );
}

export function MoveStopSheet({
  day,
  days,
  onPick,
  onClose,
}: {
  readonly day: TripDay;
  readonly days: readonly TripDay[];
  readonly onPick: (stop: DayItem, to: number) => void;
  readonly onClose: () => void;
}) {
  const { t } = useLingui();
  const locale = useLocale();
  const styles = useStyles();
  const [stop, setStop] = useState<DayItem | null>(null);
  return (
    <Sheet
      detents={['fit']}
      title={
        stop === null
          ? t({ id: 'plan.allDays.move.pickStop', message: 'Move which stop?' })
          : t({ id: 'plan.allDays.move.pickDay', message: 'Move to day…' })
      }
      onDismiss={onClose}
      testID="move-stop-sheet"
    >
      <View style={styles.body}>
        {stop === null ? (
          <View style={styles.stops}>
            {day.stops.map((one) => (
              <PillButton
                key={one.stableId}
                size="sm"
                variant="secondary"
                casing="sentence"
                label={one.title}
                onPress={() => setStop(one)}
                testID={`move-stop-${one.stableId}`}
              />
            ))}
          </View>
        ) : (
          <DayChips
            days={dayChips(
              days.filter((other) => other.dayNo !== day.dayNo),
              locale,
            )}
            onSelect={(to) => onPick(stop, to)}
            testID="move-stop-days"
          />
        )}
      </View>
    </Sheet>
  );
}
