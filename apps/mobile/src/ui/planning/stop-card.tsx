/**
 * A day's stops as a timeline (7a-2, 7b-1, 7f-1): the time column (start time over how long it
 * takes), the stop card (its number in the day's colour, name, one line of detail, an action or
 * tag at the end; outlined when it needs a look), and the leg between two stops ("CAR · 1H10")
 * on a dashed line.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

const TIME_WIDTH = 50;
const NUMBER = 26;

const useStyles = makeStyles((t) => ({
  time: { width: TIME_WIDTH, alignItems: 'flex-end', paddingTop: t.space['12'] },
  card: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['10'],
    paddingVertical: t.space['12'],
    paddingHorizontal: t.space['12'],
    borderRadius: t.radius.md,
    backgroundColor: t.semantic.bg.raised,
    borderWidth: 2,
    borderColor: t.semantic.bg.raised,
  },
  number: {
    width: NUMBER,
    height: NUMBER,
    borderRadius: NUMBER / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: { flex: 1, minWidth: 0 },
  dimmed: { opacity: 0.5 },
  leg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space['12'],
    // The dashed line runs under the stop numbers: past the time column and the card's padding.
    marginStart: TIME_WIDTH + t.space['12'] + t.space['12'] + NUMBER / 2 - 1,
    minHeight: 28,
  },
  dash: {
    width: 0,
    alignSelf: 'stretch',
    borderStartWidth: 2,
    borderStyle: 'dashed',
    borderColor: t.semantic.border.decorative,
  },
  row: { flexDirection: 'row', gap: t.space['12'] },
}));

export function TimeColumn({ time, length }: { readonly time: string; readonly length?: string }) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.time}>
      {/* A 12-hour time ("10:00 AM") shrinks to stay on its line; a 24-hour one already fits. */}
      <Text variant="monoData" numberOfLines={1} autoFit autoFitMinSize={10}>
        {time}
      </Text>
      {length === undefined ? null : (
        <Text variant="caption" color={theme.semantic.text.secondary}>
          {length}
        </Text>
      )}
    </View>
  );
}

export interface StopCardProps {
  readonly n: number;
  readonly title: string;
  readonly detail?: string | undefined;
  /** The day's colour: the number's disc, and the outline when `outlined`. */
  readonly color: string;
  /** Needs a look (7a-2 the rainy walk): outlined in the day's colour. */
  readonly outlined?: boolean | undefined;
  readonly trailing?: ReactNode | undefined;
  readonly onPress?: (() => void) | undefined;
  readonly testID?: string | undefined;
  /** Lines the name may take before it is cut (default 1; the day's own lists give it 2). */
  readonly titleLines?: 1 | 2 | undefined;
  /** Stands back from the rest: a stop this person skips, or one already over. */
  readonly dimmed?: boolean | undefined;
  /** Already over: a tick in place of the number. */
  readonly done?: boolean | undefined;
  /** Stands in for the number on a stop the day's route does not count. */
  readonly mark?: string | undefined;
}

export function StopCard({
  n,
  title,
  detail,
  color,
  outlined = false,
  trailing,
  onPress,
  testID,
  titleLines = 1,
  dimmed = false,
  done = false,
  mark,
}: StopCardProps) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={[String(n), title, detail]
        .filter((part) => part !== undefined)
        .join(', ')}
      style={{ flex: 1 }}
      testID={testID}
    >
      <View
        style={[
          styles.card,
          outlined ? { borderColor: color } : null,
          dimmed || done ? styles.dimmed : null,
        ]}
      >
        <View style={[styles.number, { backgroundColor: color }]}>
          <Text variant="label" color={theme.color.paper.bright}>
            {done ? '✓' : (mark ?? String(n))}
          </Text>
        </View>
        <View style={styles.body}>
          <Text variant="title" numberOfLines={titleLines}>
            {title}
          </Text>
          {detail === undefined ? null : (
            <Text variant="bodySm" color={theme.semantic.text.secondary} numberOfLines={1}>
              {detail}
            </Text>
          )}
        </View>
        {trailing}
      </View>
    </PressScale>
  );
}

/** A stop with its time: the row a day plan repeats. */
export function TimedStop({
  time,
  length,
  ...card
}: StopCardProps & { readonly time: string; readonly length?: string }) {
  const styles = useStyles();
  return (
    <View style={styles.row}>
      <TimeColumn time={time} {...(length === undefined ? {} : { length })} />
      <StopCard {...card} />
    </View>
  );
}

/** The leg between two stops: how and how long ("CAR · 1H10", "WALK · 20 MIN"). */
export function LegConnector({ label }: { readonly label: string }) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <View style={styles.leg}>
      <View style={styles.dash} />
      <Text variant="label" color={theme.semantic.text.secondary}>
        {label}
      </Text>
    </View>
  );
}
