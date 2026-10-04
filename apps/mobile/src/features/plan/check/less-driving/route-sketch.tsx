/**
 * A day's route as Less driving draws it (7h-3 BEFORE / AFTER): the stay as a yellow diamond, the
 * stops as numbered pink dots in the order given, joined by straight lines, fitted to the box. The
 * AFTER sketch fades in once the old one has drawn (a plain fade when motion is reduced).
 */
/* eslint-disable lingui/no-unlocalized-strings -- keys and transforms, never copy. */
import { tokens } from '@cp/design-tokens';
import { View } from 'react-native';

import { sketchLayout, type SketchPoint } from '@/ui/planning';
import { Text } from '@/ui/text/Text';
import { degrees, makeStyles } from '@/ui/theme';

export interface RouteSketchProps {
  /** Stops in route order. */
  readonly stops: readonly SketchPoint[];
  readonly stay: SketchPoint | null;
  readonly width: number;
  readonly height: number;
  readonly testID?: string;
}

const DOT = 22;
const LINE = 2.5;
const DIAMOND = 18;

const useStyles = makeStyles(() => ({
  box: { overflow: 'visible' },
  line: {
    position: 'absolute',
    height: LINE,
    borderRadius: LINE / 2,
    backgroundColor: tokens.color.pink,
  },
  dot: {
    position: 'absolute',
    width: DOT,
    height: DOT,
    borderRadius: DOT / 2,
    backgroundColor: tokens.color.pink,
    borderWidth: 2,
    borderColor: tokens.color.paper.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diamond: {
    position: 'absolute',
    width: DIAMOND,
    height: DIAMOND,
    borderRadius: 4,
    backgroundColor: tokens.color.yellow,
    transform: [{ rotate: '45deg' }],
  },
}));

export function RouteSketch({ stops, stay, width, height, testID }: RouteSketchProps) {
  const styles = useStyles();
  const all = stay === null ? stops : [stay, ...stops, stay];
  const laid = sketchLayout(all, width, height);
  const points = stay === null ? laid : laid.slice(1, -1);
  const home = stay === null ? null : (laid[0] ?? null);
  return (
    <View
      style={[styles.box, { width, height }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID={testID}
    >
      {laid.slice(1).map((to, index) => {
        const from = laid[index] ?? to;
        const length = Math.hypot(to.x - from.x, to.y - from.y);
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        return (
          <View
            key={`line-${String(index)}`}
            style={[
              styles.line,
              {
                width: length,
                left: (from.x + to.x) / 2 - length / 2,
                top: (from.y + to.y) / 2 - LINE / 2,
                transform: [{ rotate: degrees((angle * 180) / Math.PI) }],
              },
            ]}
          />
        );
      })}
      {home === null ? null : (
        <View style={[styles.diamond, { left: home.x - DIAMOND / 2, top: home.y - DIAMOND / 2 }]} />
      )}
      {points.map((point, index) => (
        <View
          key={`dot-${String(index)}`}
          style={[styles.dot, { left: point.x - DOT / 2, top: point.y - DOT / 2 }]}
        >
          <Text variant="label" color={tokens.color.paper.ink}>
            {String(index + 1)}
          </Text>
        </View>
      ))}
    </View>
  );
}
