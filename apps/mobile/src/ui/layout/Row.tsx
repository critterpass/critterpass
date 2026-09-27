import { View } from 'react-native';

import type { StackProps } from './Stack';
import { spacingStyle } from './Stack';

export interface RowProps extends StackProps {
  /** Wrap onto new lines (chips wrap at large text sizes, docs/design-system.md §5). */
  readonly wrap?: boolean;
}

/** Horizontal flow layout; `row` follows the writing direction, so it mirrors under RTL. */
export function Row({
  gap,
  padding,
  align = 'center',
  justify,
  flex,
  wrap = false,
  style,
  ...rest
}: RowProps) {
  return (
    <View
      {...rest}
      style={[
        { flexDirection: 'row', flexWrap: wrap ? 'wrap' : 'nowrap' },
        spacingStyle({ gap, padding, align, justify, flex }),
        style,
      ]}
    />
  );
}
