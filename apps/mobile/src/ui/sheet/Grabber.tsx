import { View } from 'react-native';

import { tokens } from '@cp/design-tokens';

import { makeStyles } from '../theme';

const GRABBER_WIDTH = 36;
const GRABBER_HEIGHT = 5;

/** Height the grabber row adds above sheet content (bar plus its padding). */
export const GRABBER_ZONE_HEIGHT = GRABBER_HEIGHT + tokens.space['8'] + tokens.space['4'];

const useStyles = makeStyles((t) => ({
  zone: { alignItems: 'center', paddingTop: t.space['8'], paddingBottom: t.space['4'] },
  bar: {
    width: GRABBER_WIDTH,
    height: GRABBER_HEIGHT,
    borderRadius: GRABBER_HEIGHT / 2,
    backgroundColor: t.semantic.border.decorative,
  },
}));

/** Drag affordance at the top of a sheet; decorative (the ✕ is the accessible dismiss). */
export function Grabber() {
  const styles = useStyles();
  return (
    <View
      style={styles.zone}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={styles.bar} />
    </View>
  );
}
