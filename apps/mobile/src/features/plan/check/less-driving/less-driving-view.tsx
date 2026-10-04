/**
 * Less driving (7h-3), from props only: ← the day and ONLY YOU SEE THIS; SAME DAY, LESS DRIVING;
 * the drive time counting down from the old to the new ("2H10 → 1H05 in the car"); the BEFORE and
 * AFTER sketches; the new order, each row with its new time, a lock and BOOKED for a stop that
 * never moves, or where it used to be ("WAS 12:00", "WAS 4TH"); USE THIS ORDER pinned under it with
 * "Send it to the crew first". Undesigned: loading, and no shorter order.
 */
import { tokens } from '@cp/design-tokens';
import { t } from '@lingui/core/macro';
import { ScrollView, View } from 'react-native';
import Animated, { FadeIn, LinearTransition } from 'react-native-reanimated';

import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Icon } from '@/ui/icons/Icon';
import type { SketchPoint } from '@/ui/planning';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Skeleton } from '@/ui/states/Skeleton';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { RouteSketch } from './route-sketch';

export interface OrderRow {
  readonly key: string;
  readonly time: string;
  readonly name: string;
  readonly booked: boolean;
  /** "WAS 12:00" / "WAS 4TH"; null when it stays where it was. */
  readonly was: string | null;
}

export interface LessDrivingViewProps {
  readonly backLabel: string;
  readonly onBack: () => void;
  readonly state: 'loading' | 'none' | 'ready';
  readonly before: string;
  readonly after: string;
  readonly beforeStops: readonly SketchPoint[];
  readonly afterStops: readonly SketchPoint[];
  readonly stay: SketchPoint | null;
  readonly rows: readonly OrderRow[];
  readonly primary: {
    readonly label: string;
    readonly busy: boolean;
    readonly onPress: () => void;
  } | null;
  readonly send: (() => void) | null;
  readonly reducedMotion: boolean;
}

const SKETCH_W = 150;
const SKETCH_H = 120;
const NUM = 22;

const useStyles = makeStyles((th) => ({
  content: {
    paddingHorizontal: th.space['20'],
    paddingBottom: th.space['24'],
    gap: th.space['14'],
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  chip: {
    borderRadius: th.radius.sm,
    paddingHorizontal: th.space['8'],
    paddingVertical: th.space['4'],
    backgroundColor: th.semantic.bg.control,
  },
  drive: { flexDirection: 'row', alignItems: 'baseline', gap: th.space['10'], flexWrap: 'wrap' },
  sketches: { flexDirection: 'row', justifyContent: 'space-between' },
  sketch: { gap: th.space['8'] },
  list: { borderRadius: th.radius.lg, backgroundColor: th.semantic.bg.raised },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['10'],
    paddingHorizontal: th.space['14'],
    paddingVertical: th.space['10'],
  },
  num: {
    width: NUM,
    height: NUM,
    borderRadius: NUM / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.color.pink,
  },
  name: { flex: 1, minWidth: 0 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['4'],
    borderRadius: th.radius.lg,
    paddingHorizontal: th.space['8'],
    paddingVertical: th.space['4'],
    backgroundColor: th.semantic.bg.control,
  },
  booked: { backgroundColor: tokens.color.green.base },
  notice: {
    padding: th.space['14'],
    borderRadius: th.radius.lg,
    backgroundColor: th.semantic.bg.raised,
  },
  scroll: { flex: 1 },
  footer: {
    gap: th.space['12'],
    alignItems: 'center',
    paddingHorizontal: th.space['20'],
    paddingTop: th.space['8'],
    paddingBottom: th.space['8'],
  },
}));

export function LessDrivingView(props: LessDrivingViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const appear = props.reducedMotion
    ? FadeIn.duration(tokens.motion.duration.fast)
    : FadeIn.delay(600);
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="plan-less-driving">
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <BackEyebrow label={props.backLabel} onPress={props.onBack} />
          <View style={styles.chip}>
            <Text variant="label" color={theme.semantic.text.secondary}>
              {t({ id: 'plan.check.onlyYou', message: 'ONLY YOU SEE THIS' })}
            </Text>
          </View>
        </View>
        <Text variant="h1" singleLine={false} testID="plan-less-driving-title">
          {t({ id: 'plan.check.lessDriving.title', message: 'SAME DAY,\nLESS DRIVING' })}
        </Text>
        {props.state === 'loading' ? <Skeleton preset="list" repeat={4} /> : null}
        {props.state === 'none' ? (
          <View style={styles.notice} testID="plan-less-driving-none">
            <Text variant="body" singleLine={false}>
              {t({
                id: 'plan.check.lessDriving.none',
                message:
                  'This order is already the shortest Tokek can find without moving anything booked.',
              })}
            </Text>
          </View>
        ) : null}
        {props.state === 'ready' ? (
          <>
            <View style={styles.drive} testID="plan-less-driving-drive">
              <Text
                variant="h2"
                color={theme.semantic.text.secondary}
                style={{ textDecorationLine: 'line-through' }}
              >
                {props.before}
              </Text>
              <Text variant="h2">→</Text>
              <Text variant="h2" color={tokens.color.green.base}>
                {props.after}
              </Text>
              <Text variant="bodySm" color={theme.semantic.text.secondary}>
                {t({ id: 'plan.check.lessDriving.inCar', message: 'in the car' })}
              </Text>
            </View>
            <View style={styles.sketches}>
              <View style={styles.sketch}>
                <Text variant="eyebrow" color={theme.semantic.text.secondary}>
                  {t({ id: 'plan.check.lessDriving.before', message: 'Before' })}
                </Text>
                <RouteSketch
                  stops={props.beforeStops}
                  stay={props.stay}
                  width={SKETCH_W}
                  height={SKETCH_H}
                />
              </View>
              <Animated.View entering={appear} style={styles.sketch}>
                <Text variant="eyebrow" color={tokens.color.green.base}>
                  {t({ id: 'plan.check.lessDriving.after', message: 'After' })}
                </Text>
                <RouteSketch
                  stops={props.afterStops}
                  stay={props.stay}
                  width={SKETCH_W}
                  height={SKETCH_H}
                />
              </Animated.View>
            </View>
            <View style={styles.list} testID="plan-less-driving-rows">
              {props.rows.map((row, index) => (
                <Animated.View
                  key={row.key}
                  layout={props.reducedMotion ? undefined : LinearTransition.springify()}
                  style={styles.row}
                  testID={`plan-less-driving-row-${String(index + 1)}`}
                >
                  <View style={styles.num}>
                    <Text variant="label" color={tokens.color.paper.ink}>
                      {String(index + 1)}
                    </Text>
                  </View>
                  <Text variant="monoData">{row.time}</Text>
                  <Text variant="title" numberOfLines={1} style={styles.name}>
                    {row.name}
                  </Text>
                  {row.booked ? (
                    <View style={[styles.badge, styles.booked]}>
                      <Icon name="lock" size={12} color={tokens.color.paper.ink} decorative />
                      <Text variant="label" color={tokens.color.paper.ink}>
                        {t({ id: 'plan.check.lessDriving.booked', message: 'Booked' })}
                      </Text>
                    </View>
                  ) : row.was === null ? null : (
                    <View style={styles.badge}>
                      <Text variant="label" color={theme.semantic.text.secondary}>
                        {row.was}
                      </Text>
                    </View>
                  )}
                </Animated.View>
              ))}
            </View>
          </>
        ) : null}
      </ScrollView>
      <View style={styles.footer}>
        {props.primary === null ? null : (
          <PillButton
            label={props.primary.label}
            onPress={props.primary.onPress}
            loading={props.primary.busy}
            disabled={props.state !== 'ready'}
            block
            testID="plan-less-driving-use"
          />
        )}
        {props.send === null || props.state !== 'ready' ? null : (
          <TextLink
            label={t({ id: 'plan.check.sendFirst', message: 'Send it to the crew first' })}
            onPress={props.send}
            testID="plan-less-driving-send"
          />
        )}
      </View>
    </Scaffold>
  );
}
