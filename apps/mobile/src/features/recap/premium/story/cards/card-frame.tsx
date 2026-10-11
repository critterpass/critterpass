/**
 * The room every premium story card keeps (the bars and presenter row above, the caption and its
 * action below) and the sticker every card draws a recap form with.
 */
import type { ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CritterSticker, usePremiumTheme } from '@/ui/premium';

import { artKind, formSpec } from '../../../data/critter-art';
import type { FormRow } from '../../../data/recap-rows';

export function CardFrame({
  children,
  ground,
  style,
  testID,
}: {
  readonly children: ReactNode;
  /** The card's ground; the page's ground colour unless the card is paper or coloured. */
  readonly ground?: string;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID: string;
}) {
  const th = usePremiumTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        {
          flex: 1,
          paddingTop: insets.top + 96,
          paddingBottom: insets.bottom + 110,
          paddingHorizontal: 24,
          backgroundColor: ground ?? th.color.ground,
        },
        style,
      ]}
      testID={testID}
    >
      {children}
    </View>
  );
}

export function FormSticker({
  row,
  size,
  pose,
}: {
  readonly row: FormRow;
  readonly size: number;
  readonly pose?: 'cheer' | 'wave' | 'idle';
}) {
  const spec = formSpec(row);
  const seed = row.canonical_seed ?? undefined;
  return (
    <CritterSticker
      kind={artKind(row.critter_key)}
      name={row.city ?? ''}
      size={size}
      {...(pose === undefined ? {} : { pose })}
      {...(spec === null ? {} : { form: spec })}
      {...(seed === undefined ? {} : { seed })}
    />
  );
}
