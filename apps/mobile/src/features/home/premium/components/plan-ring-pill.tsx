/**
 * "Plan 80%" (3.02): a control pill with a 20 pt conic ring (ink done, todo grey) round a 12 pt
 * hole in the pill's own colour.
 */
/* eslint-disable lingui/no-unlocalized-strings -- CSS gradients and shadows, never copy. */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { makePremiumStyles, Text, usePremiumTheme } from '@/ui/premium';

const RING = 20;
const HOLE = 12;

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
  ring: {
    width: RING,
    height: RING,
    borderRadius: RING / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hole: { width: HOLE, height: HOLE, borderRadius: HOLE / 2, backgroundColor: t.color.control },
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
  return (
    <View
      style={styles.pill}
      testID={testID}
      accessible
      accessibilityLabel={tr({
        id: 'home.nextUp.planSpoken',
        message: `plan ${done} percent done`,
      })}
    >
      <View
        style={[
          styles.ring,
          {
            backgroundImage: `conic-gradient(${t.color.ink} 0% ${done}%, ${t.color.progressTodo} ${done}% 100%)`,
          },
        ]}
      >
        <View style={styles.hole} />
      </View>
      <Text variant="buttonSmall">{tr({ id: 'home.premium.plan', message: `Plan ${done}%` })}</Text>
    </View>
  );
}
