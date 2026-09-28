import { View } from 'react-native';

import { Text } from '../text/Text';
import { makeStyles } from '../theme';

export interface MrzLinesProps {
  readonly lines: readonly string[];
  readonly testID?: string;
}

const useStyles = makeStyles(() => ({
  line: { letterSpacing: 0.5 },
}));

/**
 * The pass's machine-readable zone: fixed-width lines that shrink to fit the page width. Rewrites
 * whenever its inputs change (each keystroke on 3a-2). Decorative: hidden from screen readers,
 * which read the page's own label instead.
 */
export function MrzLines({ lines, testID }: MrzLinesProps) {
  const styles = useStyles();
  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {lines.map((line, index) => (
        <Text
          // Fixed line slots; their text changes in place.
          // eslint-disable-next-line lingui/no-unlocalized-strings -- a React key.
          key={`mrz-${String(index)}`}
          variant="monoData"
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.6}
          style={styles.line}
        >
          {line}
        </Text>
      ))}
    </View>
  );
}
