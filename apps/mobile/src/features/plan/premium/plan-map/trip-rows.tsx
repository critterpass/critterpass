/**
 * The whole trip at full (4.27): one compact row per day (a bar in the day's colour, its date,
 * its title, the tag its row carries and how full it is), the check's lead line with a way to the
 * fixes, and how many saved places still wait in Ideas. A day row opens that day at half; a day
 * with a problem the check can fix opens it in place under the row from its tag (4.43).
 */
import { Fragment, useState } from 'react';
import { View } from 'react-native';

import {
  GuideNote,
  makePremiumStyles,
  PressableScale,
  StatusTag,
  Text,
  usePremiumTheme,
  type StatusTone,
} from '@/ui/premium';

import type { DayTag } from '../../trip-map/trip-days';
import { dayColours } from '../map';
import { FixPanel, type DayFix } from './fix-panel';

export interface TripRow {
  readonly dayNo: number;
  readonly date: string;
  readonly title: string;
  readonly tag: { readonly tag: DayTag; readonly label: string } | null;
  /** 0–5. */
  readonly pace: number;
  readonly accessibilityLabel: string;
}

export interface TripRowsProps {
  readonly rows: readonly TripRow[];
  readonly check: {
    readonly line: string;
    readonly action: string;
    readonly onPress: () => void;
  } | null;
  readonly guideName: string;
  readonly ideas: {
    readonly line: string;
    readonly action: string;
    readonly onPress: () => void;
  } | null;
  readonly onOpenDay: (dayNo: number) => void;
  /** The check's open fixes by day, opened in place from the day's tag. */
  readonly fixes?: ReadonlyMap<number, readonly DayFix[]>;
  /** Every way to fix a problem: the plan check. */
  readonly onOtherWays?: () => void;
}

/** A day's tag in its status tint. */
export function tagTone(tag: DayTag): StatusTone {
  switch (tag.kind) {
    case 'booked':
      return 'booked';
    case 'too_far':
      return 'tangerine';
    case 'rain':
      return 'rain';
    case 'clash':
    case 'closed':
    case 'vote':
      return 'voteOpen';
  }
}

const useStyles = makePremiumStyles((t) => ({
  card: {
    marginTop: t.space.gap10,
    backgroundColor: t.color.card,
    borderRadius: t.radius.card,
    boxShadow: t.shadow.card,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 47,
    paddingHorizontal: t.space.gap12,
    gap: t.space.gap10,
  },
  divider: { borderTopWidth: 0.5, borderTopColor: t.color.hairline },
  bar: { width: 6, height: 28, borderRadius: 3 },
  date: { width: 52 },
  title: { flex: 1 },
  pace: { flexDirection: 'row', gap: 2 },
  paceBar: { width: 7, height: 12, borderRadius: 2 },
  foot: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: t.space.gap12,
    paddingHorizontal: t.space.gap4,
  },
  note: { marginTop: t.space.gap10 },
}));

export function PaceBars({ level, dayNo }: { readonly level: number; readonly dayNo: number }) {
  const styles = useStyles();
  const t = usePremiumTheme();
  return (
    <View style={styles.pace} accessible={false}>
      {[1, 2, 3, 4, 5].map((n) => (
        <View
          key={n}
          style={[
            styles.paceBar,
            { backgroundColor: n <= level ? dayColours(dayNo).fill : t.color.fieldBorder },
          ]}
        />
      ))}
    </View>
  );
}

export function TripRows({
  rows,
  check,
  guideName,
  ideas,
  onOpenDay,
  fixes,
  onOtherWays,
}: TripRowsProps) {
  const styles = useStyles();
  const theme = usePremiumTheme();
  const [opened, setOpened] = useState<number | null>(null);
  return (
    <View>
      {check === null ? null : (
        <View style={styles.note}>
          <GuideNote
            name={guideName}
            text={check.line}
            showName={false}
            action={{ label: check.action, onPress: check.onPress }}
            testID="trip-check-note"
          />
        </View>
      )}
      <View style={styles.card}>
        {rows.map((row, index) => {
          const dayFixes = fixes?.get(row.dayNo) ?? [];
          const first = dayFixes[0];
          const open = opened === row.dayNo && first !== undefined;
          return (
            <Fragment key={row.dayNo}>
              <PressableScale
                onPress={() => onOpenDay(row.dayNo)}
                accessibilityRole="button"
                accessibilityLabel={row.accessibilityLabel}
                testID={`trip-day-${String(row.dayNo)}`}
                style={[
                  styles.row,
                  index === 0 ? null : styles.divider,
                  open ? { backgroundColor: theme.color.ground } : null,
                ]}
              >
                <View style={[styles.bar, { backgroundColor: dayColours(row.dayNo).fill }]} />
                <Text variant="helper" tone="muted" style={styles.date} numberOfLines={1}>
                  {row.date}
                </Text>
                <Text variant="rowTextStrong" style={styles.title} numberOfLines={1}>
                  {row.title}
                </Text>
                {first !== undefined ? (
                  <PressableScale
                    onPress={() => setOpened(open ? null : row.dayNo)}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: open }}
                    accessibilityLabel={first.card.title}
                    testID={`trip-day-fix-${String(row.dayNo)}`}
                  >
                    <StatusTag
                      label={row.tag?.label ?? first.card.tags[0]?.label ?? first.card.title}
                      tone={row.tag === null ? 'voteOpen' : tagTone(row.tag.tag)}
                    />
                  </PressableScale>
                ) : row.tag === null ? null : (
                  <StatusTag label={row.tag.label} tone={tagTone(row.tag.tag)} />
                )}
                <PaceBars level={row.pace} dayNo={row.dayNo} />
              </PressableScale>
              {open && first !== undefined ? (
                <FixPanel fix={first} onOtherWays={onOtherWays ?? (() => undefined)} />
              ) : null}
            </Fragment>
          );
        })}
      </View>
      {ideas === null ? null : (
        <PressableScale onPress={ideas.onPress} accessibilityRole="button" style={styles.foot}>
          <Text variant="label" tone="muted">
            {ideas.line}
          </Text>
          <Text variant="bannerAction">{ideas.action}</Text>
        </PressableScale>
      )}
    </View>
  );
}
