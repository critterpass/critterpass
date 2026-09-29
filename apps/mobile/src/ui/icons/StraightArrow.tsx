import { I18nManager, View } from 'react-native';

import { degrees, makeStyles } from '../theme';

export type ArrowDirection = 'up' | 'forward' | 'back';

export interface StraightArrowProps {
  /** Which way it points; `forward` and `back` follow the reading direction. */
  readonly direction: ArrowDirection;
  /** Box size in points (the arrow spans it). @default 20 */
  readonly size?: number;
  readonly color: string;
  readonly testID?: string;
}

const useStyles = makeStyles(() => ({
  box: { alignItems: 'center', justifyContent: 'center' },
  shaft: { position: 'absolute' },
  head: { position: 'absolute', borderTopWidth: 0, borderEndWidth: 0 },
}));

function rotationFor(direction: ArrowDirection): number {
  if (direction === 'up') return 0;
  const forward = I18nManager.isRTL ? -90 : 90;
  return direction === 'forward' ? forward : -forward;
}

/**
 * A plain, straight arrow for controls that must read at a glance (send, back, next), where the
 * hand-drawn arrow doodle's swoop reads poorly at small sizes. Decorative: the control carries the
 * label.
 */
export function StraightArrow({ direction, size = 20, color, testID }: StraightArrowProps) {
  const styles = useStyles();
  const stroke = Math.max(2, Math.round(size / 9));
  const head = size * 0.42;
  return (
    <View
      testID={testID}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[
        styles.box,
        { width: size, height: size, transform: [{ rotate: degrees(rotationFor(direction)) }] },
      ]}
    >
      <View
        style={[
          styles.shaft,
          {
            width: stroke,
            height: size * 0.8,
            bottom: size * 0.1,
            borderRadius: stroke / 2,
            backgroundColor: color,
          },
        ]}
      />
      <View
        style={[
          styles.head,
          {
            width: head,
            height: head,
            top: size * 0.1 + stroke / 2,
            borderStartWidth: stroke,
            borderBottomWidth: stroke,
            borderColor: color,
            // The chevron is the corner of a square turned so it points up.
            transform: [{ rotate: degrees(135) }],
          },
        ]}
      />
    </View>
  );
}
