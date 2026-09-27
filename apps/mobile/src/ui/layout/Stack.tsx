import { View } from 'react-native';
import type { StyleProp, ViewProps, ViewStyle } from 'react-native';

import type { Tokens } from '@cp/design-tokens';
import { tokens } from '@cp/design-tokens';

/** A spacing-scale step (`2`…`32`, docs/design-system.md §1.4). */
export type SpaceStep = keyof Tokens['space'];

export interface StackProps extends ViewProps {
  /** Space token between children. */
  readonly gap?: SpaceStep | undefined;
  /** Space token on every side. */
  readonly padding?: SpaceStep | undefined;
  readonly align?: ViewStyle['alignItems'] | undefined;
  readonly justify?: ViewStyle['justifyContent'] | undefined;
  readonly flex?: number | undefined;
  readonly style?: StyleProp<ViewStyle> | undefined;
}

/** Shared by `Stack` and `Row`: token spacing only, never raw numbers. */
export function spacingStyle({
  gap,
  padding,
  align,
  justify,
  flex,
}: Pick<StackProps, 'gap' | 'padding' | 'align' | 'justify' | 'flex'>): ViewStyle {
  return {
    ...(gap ? { gap: tokens.space[gap] } : {}),
    ...(padding ? { padding: tokens.space[padding] } : {}),
    ...(align ? { alignItems: align } : {}),
    ...(justify ? { justifyContent: justify } : {}),
    ...(flex !== undefined ? { flex } : {}),
  };
}

/** Vertical flow layout (the design's absolute positioning is never reproduced). */
export function Stack({ gap, padding, align, justify, flex, style, ...rest }: StackProps) {
  return (
    <View
      {...rest}
      style={[
        { flexDirection: 'column' },
        spacingStyle({ gap, padding, align, justify, flex }),
        style,
      ]}
    />
  );
}
