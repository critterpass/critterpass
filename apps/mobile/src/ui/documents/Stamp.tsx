import { View } from 'react-native';
import Animated from 'react-native-reanimated';

import { useStamp } from '@/motion/patterns/stamp';

import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export type StampShape = 'round' | 'rect' | 'pending';

export interface StampProps {
  /** Big centre word ("SIN", "PAID", "First trip free"). */
  readonly title: string;
  /** Small arc/top line ("Home", "Balances"). */
  readonly top?: string;
  /** Small bottom line ("In full", "Oct 12–26"). */
  readonly bottom?: string;
  /** Ink per context: destination colour, orange for home, green for PAID. */
  readonly ink: string;
  /** `pending` is a dashed outline still waiting to be earned. @default 'round' */
  readonly shape?: StampShape;
  /** @default 96 */
  readonly size?: number;
  /** Degrees of hand-stamped tilt. @default -8 */
  readonly tilt?: number;
  /** Slam down with the stamp impact when it first appears. */
  readonly slam?: boolean;
  /** Read instead of the printed words. */
  readonly accessibilityLabel?: string;
  readonly testID?: string;
}

const useStyles = makeStyles(() => ({
  face: { alignItems: 'center', justifyContent: 'center', borderWidth: 4, padding: 6 },
  inner: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  line: { alignSelf: 'stretch', textAlign: 'center' },
}));

/** Stamp words shrink to fit their ring rather than wrap mid-word ("ISSU/ED") or truncate. */
const FIT = { adjustsFontSizeToFit: true, minimumFontScale: 0.45 } as const;

/**
 * Side inset of the stamp's lines: a round face narrows towards its top and bottom, so its small
 * lines keep clear of the ring (the chord at the height they sit is about 80% of the diameter).
 */
export function stampLineInset(innerWidth: number, round: boolean): number {
  return round ? Math.round(innerWidth * 0.1) : 4;
}

/**
 * The most a round stamp's small lines may be set at: an eighth of its diameter, never above the
 * label size. A short line ("6/2024") does not trigger shrink-to-fit, and at the full label size
 * it ran into the ring of a small stamp. Stamps of 85 pt and up are unchanged.
 */
export function stampLineMaxSize(size: number, labelSize: number): number {
  return Math.min(labelSize, Math.round(size * 0.13 * 10) / 10);
}

function Face({ title, top, bottom, ink, shape = 'round', size = 96, tilt = -8 }: StampProps) {
  const styles = useStyles();
  const theme = useTheme();
  const round = shape !== 'rect';
  const width = round ? size : size * 1.6;
  const radius = round ? size / 2 : theme.radius.sm;
  const labelSize = theme.type.label.fontSize ?? 11;
  const lineSize = round ? stampLineMaxSize(size, labelSize) : labelSize;
  const edge = {
    marginHorizontal: stampLineInset(width - 16, round),
    ...(lineSize < labelSize ? { fontSize: lineSize, lineHeight: lineSize * 1.4 } : {}),
  };
  return (
    <View
      style={[
        styles.face,
        {
          width,
          height: size,
          borderRadius: radius,
          borderColor: ink,
          borderStyle: shape === 'pending' ? 'dashed' : 'solid',
          opacity: shape === 'pending' ? 0.6 : 0.92,
          transform: [{ rotate: `${tilt}deg` }],
        },
      ]}
    >
      <View
        style={[
          styles.inner,
          {
            width: width - 16,
            height: size - 16,
            borderRadius: round ? (size - 16) / 2 : theme.radius.xs,
            borderColor: shape === 'pending' ? 'transparent' : ink,
          },
        ]}
      >
        {top ? (
          <Text variant="label" color={ink} numberOfLines={1} style={[styles.line, edge]} {...FIT}>
            {top}
          </Text>
        ) : null}
        <Text
          variant="h3"
          color={ink}
          numberOfLines={round ? 1 : 2}
          style={[styles.line, { marginHorizontal: 2 }]}
          {...FIT}
        >
          {title}
        </Text>
        {bottom ? (
          <Text variant="label" color={ink} numberOfLines={1} style={[styles.line, edge]} {...FIT}>
            {bottom}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function Slam(props: StampProps) {
  const style = useStamp({ active: true });
  return (
    <Animated.View style={style}>
      <Face {...props} />
    </Animated.View>
  );
}

/** A passport/receipt stamp: round, rect or dashed pending, in its context ink; slams when earned. */
export function Stamp(props: StampProps) {
  const label =
    props.accessibilityLabel ?? [props.top, props.title, props.bottom].filter(Boolean).join(' ');
  return (
    <View testID={props.testID} accessible accessibilityRole="image" accessibilityLabel={label}>
      {props.slam ? <Slam {...props} /> : <Face {...props} />}
    </View>
  );
}
