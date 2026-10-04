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
const MIN_GAP = DOT + 4;

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

interface Spot {
  readonly x: number;
  readonly y: number;
}

/**
 * Markers pushed apart until every number reads: the sketch shows the order, not the distances,
 * so two stops on the same street sit side by side instead of on top of each other.
 */
export function spreadApart(spots: readonly Spot[], width: number, height: number): Spot[] {
  const out = spots.map((spot) => ({ ...spot }));
  const clamp = (value: number, max: number) => Math.min(max - DOT / 2, Math.max(DOT / 2, value));
  for (let round = 0; round < 40; round += 1) {
    let moved = false;
    for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        const a = out[i];
        const b = out[j];
        if (a === undefined || b === undefined) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const gap = Math.hypot(dx, dy);
        if (gap >= MIN_GAP) continue;
        // Two markers on the same spot part along a fixed diagonal, by their order.
        const ux = gap === 0 ? Math.cos(i + j) : dx / gap;
        const uy = gap === 0 ? Math.sin(i + j) : dy / gap;
        const push = (MIN_GAP - gap) / 2 + 0.5;
        a.x = clamp(a.x - ux * push, width);
        a.y = clamp(a.y - uy * push, height);
        b.x = clamp(b.x + ux * push, width);
        b.y = clamp(b.y + uy * push, height);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return out;
}

export function RouteSketch({ stops, stay, width, height, testID }: RouteSketchProps) {
  const styles = useStyles();
  // The stay once (the route leaves it and comes back), then the stops, all kept apart.
  const spread = spreadApart(
    sketchLayout(stay === null ? stops : [stay, ...stops], width, height),
    width,
    height,
  );
  const home = stay === null ? null : (spread[0] ?? null);
  const points = stay === null ? spread : spread.slice(1);
  const laid = home === null ? points : [home, ...points, home];
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
