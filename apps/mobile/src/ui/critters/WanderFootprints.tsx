import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useDeal } from '@/motion/patterns/deal';

import { Row } from '../layout/Row';
import { makeStyles } from '../theme';

export interface WanderFootprintsProps {
  /** What happened, spoken ("It wandered off toward the path"). */
  readonly accessibilityLabel: string;
  /** Prints in the trail. @default 6 */
  readonly steps?: number;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  ring: {
    width: th.space['32'] * 2,
    height: th.space['32'] * 2,
    borderRadius: th.space['32'],
    borderWidth: th.space['2'],
    borderStyle: 'dashed',
    borderColor: th.semantic.border.decorative,
  },
  print: {
    width: th.space['8'],
    height: th.space['12'],
    borderRadius: th.space['6'],
    backgroundColor: th.semantic.text.secondary,
  },
}));

function Print({ index }: { readonly index: number }) {
  const styles = useStyles();
  const deal = useDeal({ active: true, index });
  const offset = index % 2 === 0 ? -4 : 4;
  return (
    <Animated.View style={deal}>
      <View
        style={[
          styles.print,
          {
            transform: [{ translateY: offset }, { rotate: `${20}deg` }],
            opacity: 1 - index * 0.12,
          },
        ]}
      />
    </Animated.View>
  );
}

/** Where the critter was (dashed ring) and its footprints leading away. */
export function WanderFootprints({ accessibilityLabel, steps = 6, testID }: WanderFootprintsProps) {
  const styles = useStyles();
  return (
    <Row
      gap="10"
      align="center"
      testID={testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.ring} />
      {Array.from({ length: steps }, (_, index) => (
        <Print key={index} index={index} />
      ))}
    </Row>
  );
}
