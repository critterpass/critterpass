/**
 * The new block in its day (7f-1): the leave line from the stay, the block itself (time over length,
 * a yellow + disc, the place and "New · quiet till about 10", outlined in yellow), the 15-minute
 * time field under it when the time is tapped, and the nearby place as a dashed slot with its +.
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { TimeRangeField } from '@/features/plan/day/time-range-field';
import { PressScale } from '@/ui/press/PressScale';
import { GapSlot } from '@/ui/planning';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

const DISC = 26;
const PLUS = '+';

const useStyles = makeStyles((t) => ({
  leave: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['8'],
    marginStart: 50 + t.space['12'] + t.space['12'],
    minHeight: 28,
  },
  dash: {
    alignSelf: 'stretch',
    borderStartWidth: 2,
    borderStyle: 'dashed',
    borderColor: t.semantic.border.decorative,
  },
  row: { flexDirection: 'row', gap: t.space['12'] },
  time: { width: 50, alignItems: 'flex-end', paddingTop: t.space['12'] },
  card: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['10'],
    padding: t.space['12'],
    borderRadius: t.radius.md,
    borderWidth: 2,
    borderColor: t.semantic.action.primary,
    backgroundColor: t.semantic.bg.raised,
  },
  disc: {
    width: DISC,
    height: DISC,
    borderRadius: DISC / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: t.semantic.action.primary,
  },
  body: { flex: 1, minWidth: 0 },
  nearby: { marginStart: 50 + t.space['12'] },
}));

export interface AddBlockProps {
  readonly leave: string | null;
  readonly time: string;
  readonly length: string;
  readonly name: string;
  readonly detail: string;
  readonly editingTime: boolean;
  readonly onTime: () => void;
  readonly start: number;
  readonly end: number;
  readonly onTimeChange: (start: number, end: number) => void;
  readonly nearby: {
    readonly time: string;
    readonly text: string;
    readonly picked: boolean;
    readonly onToggle: () => void;
  } | null;
}

export function AddBlock({
  leave,
  time,
  length,
  name,
  detail,
  editingTime,
  onTime,
  start,
  end,
  onTimeChange,
  nearby,
}: AddBlockProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  return (
    <View testID="plan-add-block">
      {leave === null ? null : (
        <View style={styles.leave} testID="plan-add-leave">
          <View style={styles.dash} />
          <Text variant="label" color={theme.semantic.text.secondary}>
            {leave}
          </Text>
        </View>
      )}
      <View style={styles.row}>
        <PressScale
          onPress={onTime}
          accessibilityRole="button"
          accessibilityLabel={t({
            id: 'plan.add.time.a11y',
            message: `Starts ${time}. Change the time`,
          })}
          testID="plan-add-time"
        >
          {/* The sheet's own column: its 24-hour time always fits, so nothing shrinks it. */}
          <View style={styles.time}>
            <Text variant="monoData" numberOfLines={1}>
              {time}
            </Text>
            <Text variant="caption" color={theme.semantic.text.secondary}>
              {length}
            </Text>
          </View>
        </PressScale>
        <View style={styles.card}>
          <View style={styles.disc}>
            <Text variant="label" color={theme.semantic.text.onAccent}>
              {PLUS}
            </Text>
          </View>
          <View style={styles.body}>
            <Text variant="title" numberOfLines={1}>
              {name}
            </Text>
            <Text variant="bodySm" color={theme.semantic.text.secondary} numberOfLines={1}>
              {detail}
            </Text>
          </View>
        </View>
      </View>
      {editingTime ? <TimeRangeField start={start} end={end} onChange={onTimeChange} /> : null}
      {nearby === null ? null : (
        <View style={styles.nearby}>
          <GapSlot
            time={nearby.time}
            text={nearby.text}
            onAdd={nearby.onToggle}
            addLabel={
              nearby.picked
                ? t({ id: 'plan.add.nearby.drop', message: 'Leave it out' })
                : t({ id: 'plan.add.nearby.add', message: 'Add it too' })
            }
            testID="plan-add-nearby"
          />
        </View>
      )}
    </View>
  );
}
