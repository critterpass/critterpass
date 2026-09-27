import { t } from '@lingui/core/macro';
import { useState } from 'react';
import { View } from 'react-native';

import { SNAP_MINUTES } from '@/motion/gestures/drag-snap';
import { useLocale } from '@/lib/i18n/use-locale';

import { Row } from '../layout/Row';
import { PressScale } from '../press/PressScale';
import { Text } from '../text/Text';
import { Hatch } from '../textures/hatch';
import { makeStyles, useTheme } from '../theme';
import { ActionPill } from './ActionPill';
import { clockOf, GUTTER, laneStyle, MovableBlock } from './TimelineBlock';
import type { TimelineBlock } from './TimelineBlock';

export type { TimelineBlock } from './TimelineBlock';

export interface DayTimelineProps {
  readonly blocks: readonly TimelineBlock[];
  /** Hatched band where rain is forecast. */
  readonly rain?: { readonly start: number; readonly end: number; readonly label: string };
  /** The guide's suggested slot, drawn as a dashed ghost; tapping accepts it. */
  readonly ghost?: Omit<TimelineBlock, 'id' | 'movable' | 'struck'> & {
    readonly onAccept: () => void;
  };
  readonly onMove?: (id: string, start: number) => void;
  /** @default 7 */
  readonly startHour?: number;
  /** @default 19 */
  readonly endHour?: number;
  /** Vertical scale. @default 0.6 */
  readonly pointsPerMinute?: number;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  grid: { position: 'relative' },
  hour: { position: 'absolute', start: 0, end: 0, flexDirection: 'row', alignItems: 'flex-start' },
  hourLine: {
    flex: 1,
    height: th.space['2'] / 2,
    backgroundColor: th.color.divider,
    marginTop: th.space['6'],
  },
  hourLabel: { width: GUTTER },
  band: {
    position: 'absolute',
    start: GUTTER,
    end: 0,
    borderRadius: th.radius.md,
    overflow: 'hidden',
    borderWidth: th.space['2'],
    borderStyle: 'dashed',
    borderColor: th.semantic.state.info,
    alignItems: 'flex-end',
    padding: th.space['4'],
  },
  block: {
    position: 'absolute',
    borderRadius: th.radius.md,
    padding: th.space['10'],
    overflow: 'hidden',
  },
  struck: {
    borderWidth: th.space['2'],
    borderStyle: 'dashed',
    borderColor: th.semantic.border.decorative,
  },
  ghost: {
    borderWidth: th.space['2'],
    borderStyle: 'dashed',
    borderColor: th.semantic.action.primary,
  },
  stepper: {
    marginTop: th.space['12'],
    padding: th.space['10'],
    borderRadius: th.radius.lg,
    backgroundColor: th.semantic.bg.raised,
  },
}));

/**
 * A day's hour grid (07–19): blocks drag in 15-minute snaps, a hatched rain band, the guide's
 * dashed suggestion ghost, and a visible time stepper for the selected block (the non-drag path).
 */
export function DayTimeline({
  blocks,
  rain,
  ghost,
  onMove,
  startHour = 7,
  endHour = 19,
  pointsPerMinute = 0.6,
  testID,
}: DayTimelineProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const min = startHour * 60;
  const max = endHour * 60;
  const topOf = (minutes: number) => (minutes - min) * pointsPerMinute;
  const hours = Array.from(
    { length: Math.floor((endHour - startHour) / 2) + 1 },
    (_, i) => startHour + i * 2,
  );
  const selected = blocks.find((block) => block.id === selectedId);
  const step = (block: TimelineBlock, direction: 1 | -1) => {
    const duration = block.end - block.start;
    const next = Math.min(max - duration, Math.max(min, block.start + direction * SNAP_MINUTES));
    if (next !== block.start) onMove?.(block.id, next);
  };
  return (
    <View testID={testID}>
      <View style={[styles.grid, { height: (max - min) * pointsPerMinute + theme.space['16'] }]}>
        {hours.map((hour) => (
          <View
            key={hour}
            style={[styles.hour, { top: topOf(hour * 60) }]}
            importantForAccessibility="no-hide-descendants"
          >
            <Text variant="monoData" color={theme.semantic.text.secondary} style={styles.hourLabel}>
              {String(hour).padStart(2, '0')}
            </Text>
            <View style={styles.hourLine} />
          </View>
        ))}
        {rain ? (
          <View
            accessible
            accessibilityRole="text"
            accessibilityLabel={`${rain.label}, ${clockOf(locale, rain.start)}–${clockOf(locale, rain.end)}`}
            style={[
              styles.band,
              { top: topOf(rain.start), height: (rain.end - rain.start) * pointsPerMinute },
            ]}
          >
            <Hatch />
            <Text variant="label" color={theme.semantic.state.info}>
              {rain.label}
            </Text>
          </View>
        ) : null}
        {blocks.map((block) =>
          block.struck || block.movable === false || !onMove ? (
            <View
              key={block.id}
              accessible
              accessibilityRole="text"
              accessibilityLabel={[
                block.struck ? t({ id: 'common.plan.wasHere', message: 'Was here' }) : undefined,
                block.title,
                `${clockOf(locale, block.start)}–${clockOf(locale, block.end)}`,
                block.detail,
              ]
                .filter(Boolean)
                .join(', ')}
              style={[
                styles.block,
                laneStyle(block.lane),
                { top: topOf(block.start), height: (block.end - block.start) * pointsPerMinute },
                block.struck ? styles.struck : { backgroundColor: block.color },
              ]}
            >
              <Text
                variant="title"
                color={block.struck ? theme.semantic.text.secondary : theme.semantic.text.onAccent}
                style={block.struck ? { textDecorationLine: 'line-through' } : null}
                numberOfLines={1}
              >
                {block.title}
              </Text>
            </View>
          ) : (
            <MovableBlock
              key={block.id}
              block={block}
              top={topOf(block.start)}
              selected={block.id === selectedId}
              onSelect={() => setSelectedId(block.id === selectedId ? null : block.id)}
              onMove={(start) => onMove(block.id, start)}
              bounds={{ min, max }}
              pointsPerMinute={pointsPerMinute}
            />
          ),
        )}
        {ghost ? (
          <PressScale
            onPress={ghost.onAccept}
            accessibilityLabel={t({
              id: 'common.plan.acceptSuggestion',
              message: `Suggestion: ${ghost.title}, ${clockOf(locale, ghost.start)}. Accept`,
            })}
            style={[
              styles.block,
              styles.ghost,
              laneStyle(ghost.lane),
              {
                top: topOf(ghost.start),
                height: (ghost.end - ghost.start) * pointsPerMinute,
                backgroundColor: ghost.color,
              },
            ]}
          >
            <Text variant="title" color={theme.semantic.text.onAccent} numberOfLines={1}>
              {ghost.title}
            </Text>
            {ghost.detail ? (
              <Text variant="bodySm" color={theme.semantic.text.onAccent} numberOfLines={1}>
                {ghost.detail}
              </Text>
            ) : null}
          </PressScale>
        ) : null}
      </View>
      {selected && onMove ? (
        <Row style={styles.stepper} gap="8" align="center" justify="space-between">
          <Text variant="title" style={{ flex: 1 }} numberOfLines={1}>
            {`${selected.title} · ${clockOf(locale, selected.start)}`}
          </Text>
          <ActionPill
            label="−15"
            accessibilityLabel={t({ id: 'common.plan.earlier', message: 'Earlier by 15 minutes' })}
            onPress={() => step(selected, -1)}
          />
          <ActionPill
            label="+15"
            tone="primary"
            accessibilityLabel={t({ id: 'common.plan.later', message: 'Later by 15 minutes' })}
            onPress={() => step(selected, 1)}
          />
        </Row>
      ) : null}
    </View>
  );
}
