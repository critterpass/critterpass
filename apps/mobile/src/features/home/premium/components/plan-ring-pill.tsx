/**
 * "Plan 80%" (3.02): a control pill with a 20 pt ring (ink done, todo grey, from 12 o'clock) round
 * a 12 pt hole in the pill's own colour.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SVG path data, never copy. */
import { useLingui } from '@lingui/react/macro';
import { Canvas, Circle, Path } from '@shopify/react-native-skia';
import { View } from 'react-native';

import { makePremiumStyles, Text, usePremiumTheme } from '@/ui/premium';

const RING = 20;
const HOLE = 12;
const BAND = (RING - HOLE) / 2;
const CENTRE = RING / 2;
const RADIUS = (RING - BAND) / 2;

/** The done part of the ring as an SVG arc, clockwise from 12 o'clock; null when nothing is done. */
function ringArc(done: number): string | null {
  const share = Math.max(0, Math.min(1, done / 100));
  if (share === 0) return null;
  const top = `M${CENTRE} ${CENTRE - RADIUS}`;
  const bottom = `${CENTRE} ${CENTRE + RADIUS}`;
  if (share === 1) {
    return `${top}A${RADIUS} ${RADIUS} 0 1 1 ${bottom}A${RADIUS} ${RADIUS} 0 1 1 ${CENTRE} ${CENTRE - RADIUS}`;
  }
  const angle = share * 2 * Math.PI - Math.PI / 2;
  const x = CENTRE + RADIUS * Math.cos(angle);
  const y = CENTRE + RADIUS * Math.sin(angle);
  return `${top}A${RADIUS} ${RADIUS} 0 ${share > 0.5 ? 1 : 0} 1 ${x.toFixed(3)} ${y.toFixed(3)}`;
}

const useStyles = makePremiumStyles((t) => ({
  pill: {
    height: 32,
    borderRadius: 16,
    paddingStart: t.space.gap6,
    paddingEnd: t.space.gap12,
    backgroundColor: t.color.control,
    flexDirection: 'row',
    alignItems: 'center',
    gap: t.space.gap6,
    alignSelf: 'flex-start',
  },
  ring: { width: RING, height: RING },
}));

export function PlanRingPill({
  percent,
  testID,
}: {
  readonly percent: number;
  readonly testID?: string;
}) {
  const styles = useStyles();
  const t = usePremiumTheme();
  const { t: tr } = useLingui();
  const done = Math.max(0, Math.min(100, Math.round(percent)));
  const arc = ringArc(done);
  return (
    <View
      style={styles.pill}
      testID={testID}
      accessible
      accessibilityLabel={tr({
        id: 'home.premium.planSpoken',
        message: `plan ${done} percent done`,
      })}
    >
      <Canvas style={styles.ring}>
        <Circle
          cx={CENTRE}
          cy={CENTRE}
          r={RADIUS}
          style="stroke"
          strokeWidth={BAND}
          color={t.color.progressTodo}
        />
        {arc === null ? null : (
          <Path path={arc} style="stroke" strokeWidth={BAND} color={t.color.ink} />
        )}
      </Canvas>
      <Text variant="buttonSmall">{tr({ id: 'home.premium.plan', message: `Plan ${done}%` })}</Text>
    </View>
  );
}
