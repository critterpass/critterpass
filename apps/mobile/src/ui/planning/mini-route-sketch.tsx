/**
 * A day's route as a small sketch (7b-3 All days): its stops as dots joined by straight lines in
 * the day's colour, fitted to the box. Plain views, so a grid of days costs no map or canvas.
 */
import { View } from 'react-native';

import { degrees, makeStyles } from '../theme';

export interface SketchPoint {
  readonly lat: number;
  readonly lng: number;
}

export interface MiniRouteSketchProps {
  readonly points: readonly SketchPoint[];
  readonly color: string;
  readonly width: number;
  readonly height: number;
}

const DOT = 10;
const LINE = 2.5;

/** Points fitted into the box (inset by a dot), north up; one point sits in the middle. */
export function sketchLayout(
  points: readonly SketchPoint[],
  width: number,
  height: number,
): { readonly x: number; readonly y: number }[] {
  if (points.length === 0) return [];
  const lngs = points.map((point) => point.lng);
  const lats = points.map((point) => point.lat);
  const west = Math.min(...lngs);
  const east = Math.max(...lngs);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const spanX = east - west;
  const spanY = north - south;
  const innerW = width - DOT * 2;
  const innerH = height - DOT * 2;
  const scale = Math.min(
    spanX === 0 ? Infinity : innerW / spanX,
    spanY === 0 ? Infinity : innerH / spanY,
  );
  const k = Number.isFinite(scale) ? scale : 0;
  const offsetX = (width - spanX * k) / 2;
  const offsetY = (height - spanY * k) / 2;
  return points.map((point) => ({
    x: offsetX + (point.lng - west) * k,
    y: offsetY + (north - point.lat) * k,
  }));
}

const useStyles = makeStyles(() => ({
  box: { overflow: 'hidden' },
  dot: { position: 'absolute', width: DOT, height: DOT, borderRadius: DOT / 2 },
  line: { position: 'absolute', height: LINE, borderRadius: LINE / 2 },
}));

export function MiniRouteSketch({ points, color, width, height }: MiniRouteSketchProps) {
  const styles = useStyles();
  const laid = sketchLayout(points, width, height);
  return (
    <View
      style={[styles.box, { width, height }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {laid.slice(1).map((to, index) => {
        const from = laid[index] ?? to;
        const length = Math.hypot(to.x - from.x, to.y - from.y);
        const angle = Math.atan2(to.y - from.y, to.x - from.x);
        return (
          <View
            key={index}
            style={[
              styles.line,
              {
                width: length,
                left: (from.x + to.x) / 2 - length / 2,
                top: (from.y + to.y) / 2 - LINE / 2,
                backgroundColor: color,
                transform: [{ rotate: degrees((angle * 180) / Math.PI) }],
              },
            ]}
          />
        );
      })}
      {laid.map((point, index) => (
        <View
          key={index}
          style={[
            styles.dot,
            { left: point.x - DOT / 2, top: point.y - DOT / 2, backgroundColor: color },
          ]}
        />
      ))}
    </View>
  );
}
