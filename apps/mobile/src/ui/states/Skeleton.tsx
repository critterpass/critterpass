import { t } from '@lingui/core/macro';
import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import type { DimensionValue } from 'react-native';
import { View } from 'react-native';

import { Stack } from '../layout/Stack';
import { Hatch } from '../textures/hatch';
import { makeStyles, sizeToken } from '../theme';

/** One placeholder block: width as a share of the row, height in points. */
export interface SkeletonBlock {
  readonly width: DimensionValue;
  readonly height: number;
  /** Round blocks stand in for avatars and stickers. */
  readonly round?: boolean;
}

export type SkeletonPreset = 'lines' | 'card' | 'list' | 'photo';

export interface SkeletonProps {
  /** A preset matching a common final layout, or explicit `blocks`. @default 'card' */
  readonly preset?: SkeletonPreset;
  readonly blocks?: readonly SkeletonBlock[];
  /** Repeat the layout (list rows). @default 1 */
  readonly repeat?: number;
  /** Shown once loading passes 2 s: the guide thinking + typing ("Pon's on it"). */
  readonly slowHint?: ReactNode;
  /** What is loading, for screen readers ("Loading your trips"). */
  readonly label?: string;
  readonly testID?: string;
}

export const SLOW_LOADING_MS = 2000;

const PRESETS: Readonly<Record<SkeletonPreset, readonly SkeletonBlock[]>> = {
  lines: [
    { width: '90%', height: 14 },
    { width: '75%', height: 14 },
    { width: '60%', height: 14 },
  ],
  card: [
    { width: '40%', height: 12 },
    { width: '80%', height: 32 },
    { width: '55%', height: 14 },
  ],
  list: [
    { width: 44, height: 44, round: true },
    { width: '70%', height: 16 },
  ],
  photo: [{ width: '100%', height: 180 }],
};

const useStyles = makeStyles((t) => ({
  block: { overflow: 'hidden', borderRadius: t.radius.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: t.space['12'] },
  card: {
    backgroundColor: t.semantic.bg.raised,
    borderRadius: t.radius.lg,
    padding: t.size.cardInner.max,
    gap: t.space['10'],
    minHeight: sizeToken(t.size.minTouchTarget, 'height'),
  },
}));

function Block({ block }: { readonly block: SkeletonBlock }) {
  const styles = useStyles();
  return (
    <View
      style={[
        styles.block,
        { width: block.width, height: block.height },
        block.round ? { borderRadius: block.height / 2 } : null,
      ]}
    >
      <Hatch />
    </View>
  );
}

/** Loading placeholder in the final layout's shape, drawn in `tex.hatch`; slow loads get a hint. */
export function Skeleton({
  preset = 'card',
  blocks,
  repeat = 1,
  slowHint,
  label,
  testID,
}: SkeletonProps) {
  const styles = useStyles();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), SLOW_LOADING_MS);
    return () => clearTimeout(timer);
  }, []);
  const layout = blocks ?? PRESETS[preset];
  const horizontal = preset === 'list' && !blocks;
  return (
    <Stack gap="12" testID={testID}>
      <View
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel={label ?? t({ id: 'common.loading', message: 'Loading' })}
        accessibilityState={{ busy: true }}
      >
        <Stack gap="12">
          {Array.from({ length: repeat }, (_, index) => (
            <View key={index} style={horizontal ? styles.row : styles.card}>
              {layout.map((block, i) => (
                <Block key={i} block={block} />
              ))}
            </View>
          ))}
        </Stack>
      </View>
      {slow ? slowHint : null}
    </Stack>
  );
}
