/**
 * The stamp as it is inked on the recap's passport page (3m-8): a thick solid ring with a tint of
 * the same ink inside it, the small lines set along the ring (arrival over the top, the dates
 * under the foot), and the place large across the middle under whatever is drawn in it.
 */
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

/** The ring's weight as a share of the stamp's width. */
const RING = 0.1;
/** The tint inside the ring: the ink at about a seventh of its strength. */
const TINT_ALPHA = '26';
/** A letter's box along the ring; wide enough for any one capital of the label face. */
const GLYPH_BOX = 24;
/** The widest sweep one line may take around the ring, in degrees. */
const MAX_SWEEP = 150;

/**
 * Where a stamp that lands beside an older one in the corner must drop to so the two rings never
 * touch: the older one sits at the top start of a field `fieldWidth` wide, the new one is centred
 * across it, and `gap` is kept between the rings.
 */
export function stampDrop(fieldWidth: number, size: number, older: number, gap: number): number {
  const reach = size / 2 + older / 2 + gap;
  const across = Math.max(0, fieldWidth / 2 - older / 2);
  if (across >= reach) return 0;
  const down = Math.sqrt(reach * reach - across * across);
  return Math.max(0, Math.ceil(older / 2 + down - size / 2));
}

/** The degrees each letter of a line turns from the one before it at `radius`, within the sweep. */
export function arcStep(letters: number, advance: number, radius: number): number {
  if (letters <= 1 || radius <= 0) return 0;
  const natural = (advance / radius) * (180 / Math.PI);
  return Math.min(natural, MAX_SWEEP / (letters - 1));
}

const useStyles = makeStyles(() => ({
  face: { alignItems: 'center', justifyContent: 'center' },
  arc: { position: 'absolute', top: 0, bottom: 0, width: GLYPH_BOX, alignItems: 'center' },
  middle: { alignItems: 'center', justifyContent: 'center' },
  title: { textAlign: 'center' },
}));

function ArcLine({
  text,
  side,
  size,
  inset,
  color,
}: {
  readonly text: string;
  readonly side: 'top' | 'bottom';
  readonly size: number;
  readonly inset: number;
  readonly color: string;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const fontSize = Math.min(theme.type.label.fontSize ?? 11, Math.round(size * 0.055 * 10) / 10);
  const letters = Array.from(text.normalize('NFC'));
  const radius = size / 2 - inset - fontSize / 2;
  const step = arcStep(letters.length, fontSize * 0.74, radius);
  const turn = side === 'top' ? 1 : -1;
  return (
    <>
      {letters.map((letter, index) => (
        <View
          // Letters of one fixed line: their place is their identity.
          key={index}
          style={[
            styles.arc,
            {
              start: size / 2 - GLYPH_BOX / 2,
              justifyContent: side === 'top' ? 'flex-start' : 'flex-end',
              paddingVertical: inset,
              transform: [{ rotate: `${turn * (index - (letters.length - 1) / 2) * step}deg` }],
            },
          ]}
        >
          <Text
            variant="label"
            color={color}
            numberOfLines={1}
            style={{ fontSize, lineHeight: fontSize * 1.2, letterSpacing: 0 }}
          >
            {letter}
          </Text>
        </View>
      ))}
    </>
  );
}

export interface PassportStampProps {
  readonly title: string;
  /** Set along the top of the ring ("DAD · ARRIVED"). */
  readonly top?: string;
  /** Set along the foot of the ring (the dates). */
  readonly bottom?: string;
  /** The ring, its tint and the place. */
  readonly ink: string;
  /** The small lines; the same ink unless it needs darkening at their size. */
  readonly lineInk?: string;
  readonly size: number;
  /** Drawn over the place (the guide, in line). */
  readonly children?: ReactNode;
  readonly testID?: string;
}

export function PassportStamp(props: PassportStampProps) {
  const styles = useStyles();
  const { title, top, bottom, ink, size, children } = props;
  const lineInk = props.lineInk ?? ink;
  const ring = Math.round(size * RING);
  const inset = ring + Math.round(size * 0.035);
  const tint = /^#[0-9a-f]{6}$/iu.test(ink) ? `${ink}${TINT_ALPHA}` : 'transparent';
  return (
    <View
      testID={props.testID}
      accessible
      accessibilityRole="image"
      accessibilityLabel={[top, title, bottom].filter(Boolean).join(' ')}
      style={[
        styles.face,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: ring,
          borderColor: ink,
          backgroundColor: tint,
        },
      ]}
    >
      <View style={[styles.middle, { width: size - 2 * ring - size * 0.16 }]}>
        {children}
        <Text
          variant={size >= 160 ? 'h2' : 'h3'}
          color={ink}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.45}
          style={[styles.title, { alignSelf: 'stretch' }]}
        >
          {title}
        </Text>
      </View>
      {/* The lines are laid over the whole stamp, ring included, so they turn about its centre. */}
      <View
        style={{ position: 'absolute', top: -ring, start: -ring, width: size, height: size }}
        pointerEvents="none"
        importantForAccessibility="no-hide-descendants"
        accessibilityElementsHidden
      >
        {top ? <ArcLine text={top} side="top" size={size} inset={inset} color={lineInk} /> : null}
        {bottom ? (
          <ArcLine text={bottom} side="bottom" size={size} inset={inset} color={lineInk} />
        ) : null}
      </View>
    </View>
  );
}
