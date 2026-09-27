import { View } from 'react-native';

import { tokens } from '@cp/design-tokens';

import type { SpaceStep } from './Stack';

export interface SpacerProps {
  /** Fixed space token; omitted = flexible spacer that takes the remaining room. */
  readonly size?: SpaceStep;
}

/** Empty, a11y-hidden space inside a `Stack` or `Row`. */
export function Spacer({ size }: SpacerProps) {
  return (
    <View
      accessible={false}
      importantForAccessibility="no"
      style={size ? { width: tokens.space[size], height: tokens.space[size] } : { flex: 1 }}
    />
  );
}
