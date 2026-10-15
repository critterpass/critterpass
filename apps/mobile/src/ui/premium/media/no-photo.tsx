/**
 * Where a card, hero or ticket strip has no photo: a wash of the place's colour, a loose pattern of
 * travel doodles in white over it, and the place's own doodle on a sticker disc in the middle. A
 * flat block with one glyph read as a photo that failed to load; this reads as art made for the
 * place. It fills its parent; decorative (the card holding it speaks).
 */
/* eslint-disable lingui/no-unlocalized-strings -- gradient syntax and doodle names, never copy */
import { Canvas, Group, Path } from '@shopify/react-native-skia';
import { useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';

import { DOODLES, type DoodleName } from '../icons/doodles/generated';
import type { PremiumTheme } from '../theme/theme';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';

export type NoPhotoAccent = 'sun' | 'pink' | 'sky' | 'mint' | 'tangerine';

export interface NoPhotoProps {
  /** The place's doodle in the middle; none draws the wash and the pattern alone. */
  readonly doodle?: DoodleName;
  /** @default 'sky' */
  readonly accent?: NoPhotoAccent;
  /** `hero` and `card` carry the pattern; a `thumb` keeps the wash and the doodle. @default 'card' */
  readonly size?: 'hero' | 'card' | 'thumb';
  /** Turns the pattern differently per place (its id), so a row of cards isn't one wallpaper. */
  readonly seed?: string;
  readonly testID?: string;
}

/** The doodles the pattern scatters. */
const PATTERN: readonly DoodleName[] = ['plane', 'pin', 'star', 'sun', 'wave', 'ticket'];

/** The middle doodle's share of the shorter side. */
const MIDDLE: Readonly<Record<NonNullable<NoPhotoProps['size']>, number>> = {
  hero: 0.34,
  card: 0.42,
  thumb: 0.62,
};

function hash(text: string): number {
  let value = 2166136261;
  for (let at = 0; at < text.length; at += 1) {
    value ^= text.charCodeAt(at);
    value = Math.imul(value, 16777619);
  }
  return value >>> 0;
}

/** A hex accent at an opacity. */
function alpha(hex: string, opacity: number): string {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${opacity})`;
}

interface Placed {
  readonly name: DoodleName;
  readonly x: number;
  readonly y: number;
  readonly side: number;
  readonly turn: number;
}

/** A jittered grid of pattern doodles, steady for one seed and size. */
export function patternFor(width: number, height: number, seed: string): readonly Placed[] {
  const side = Math.max(22, Math.min(40, Math.min(width, height) / 5));
  const step = side * 2.1;
  const columns = Math.max(1, Math.ceil(width / step));
  const rows = Math.max(1, Math.ceil(height / step));
  let state = hash(seed) || 1;
  const next = () => {
    state = Math.imul(state ^ (state >>> 15), 2246822507) >>> 0;
    return (state % 1000) / 1000;
  };
  const placed: Placed[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const name = PATTERN[(row * 7 + column * 3 + (state % 5)) % PATTERN.length] ?? 'star';
      placed.push({
        name,
        x: column * step + (row % 2) * (step / 2) + next() * side * 0.5,
        y: row * step + next() * side * 0.5,
        side,
        turn: (next() - 0.5) * 0.7,
      });
    }
  }
  return placed;
}

/** A pattern doodle that stays off the middle disc. */
function clearOfMiddle(
  item: Placed,
  box: { readonly w: number; readonly h: number },
  disc: number,
): boolean {
  const dx = item.x + item.side / 2 - box.w / 2;
  const dy = item.y + item.side / 2 - box.h / 2;
  return Math.hypot(dx, dy) > disc * 0.75 + item.side * 0.6;
}

function paintsOf(t: PremiumTheme, wash: string): (paint: string) => string {
  const paints: Readonly<Record<string, string>> = {
    ink: t.color.ink,
    'color.orange': t.accent.tangerine,
    'color.yellow': t.accent.sun,
  };
  return (paint) => paints[paint] ?? wash;
}

export function NoPhoto({
  doodle,
  accent = 'sky',
  size = 'card',
  seed = '',
  testID,
}: NoPhotoProps) {
  const t = usePremiumTheme();
  const [box, setBox] = useState<{ readonly w: number; readonly h: number } | null>(null);
  const tint = t.accent[accent];
  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBox((was) => (was?.w === width && was.h === height ? was : { w: width, h: height }));
  };
  const short = box === null ? 0 : Math.min(box.w, box.h);
  const disc = Math.round(short * MIDDLE[size]);
  const middle = doodle === undefined ? null : DOODLES[doodle];
  const paint = paintsOf(t, t.accent.sun);
  const strong = t.scheme === 'dark' ? 0.5 : 0.62;
  return (
    <View
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      onLayout={onLayout}
      testID={testID}
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: t.color.card,
          experimental_backgroundImage: `linear-gradient(150deg, ${alpha(tint, 0.26)} 0%, ${alpha(tint, strong)} 100%)`,
        },
      ]}
    >
      {middle === null ? null : (
        <View
          style={[
            styles.disc,
            {
              width: disc * 1.5,
              height: disc * 1.5,
              borderRadius: disc,
              marginLeft: -disc * 0.75,
              marginTop: -disc * 0.75,
              backgroundColor: alpha(t.accent.stickerEdge, t.scheme === 'dark' ? 0.16 : 0.55),
            },
          ]}
        />
      )}
      {box === null ? null : (
        <Canvas style={StyleSheet.absoluteFill}>
          {size === 'thumb'
            ? null
            : patternFor(box.w, box.h, seed)
                .filter((item) => clearOfMiddle(item, box, middle === null ? 0 : disc))
                .map((item, at) => {
                  const def = DOODLES[item.name];
                  return (
                    <Group
                      key={at}
                      opacity={0.32}
                      transform={[
                        { translateX: item.x },
                        { translateY: item.y },
                        { rotate: item.turn },
                        { scale: item.side / def.viewBox[0] },
                      ]}
                    >
                      {def.layers.map((layer, index) =>
                        layer.paint === 'ink' ? (
                          <Path key={index} path={layer.d} color={t.accent.stickerEdge} />
                        ) : null,
                      )}
                    </Group>
                  );
                })}
          {middle === null || disc === 0 ? null : (
            <Group
              transform={[
                { translateX: (box.w - disc) / 2 },
                { translateY: (box.h - disc) / 2 },
                { scale: disc / middle.viewBox[0] },
              ]}
            >
              {middle.layers.map((layer, index) => (
                <Path
                  key={index}
                  path={layer.d}
                  color={paint(layer.paint)}
                  opacity={layer.opacity ?? 1}
                  {...(layer.multiply === true ? { blendMode: 'multiply' as const } : {})}
                />
              ))}
            </Group>
          )}
        </Canvas>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  disc: { position: 'absolute', left: '50%', top: '50%' },
});
