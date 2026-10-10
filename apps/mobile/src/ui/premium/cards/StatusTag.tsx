import { View } from 'react-native';

import type { PremiumPalette } from '@cp/design-tokens';

import { Text } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';

export type StatusTone = keyof PremiumPalette['status'];

export interface StatusTagProps {
  readonly label: string;
  /** booked (green), voteOpen (pink), rain (blue), maybe (yellow), unopened (grey), tangerine. */
  readonly tone: StatusTone;
  readonly testID?: string;
}

/** The 24-high status pill a row trails with ("Booked", "Vote open"). */
export function StatusTag({ label, tone, testID }: StatusTagProps) {
  const t = usePremiumTheme();
  const tint = t.color.status[tone];
  return (
    <View
      testID={testID}
      style={{
        minHeight: t.size.statusTag,
        paddingHorizontal: t.space.statusTagPadH,
        borderRadius: t.radius.statusTag,
        backgroundColor: tint.bg,
        justifyContent: 'center',
        alignSelf: 'center',
      }}
    >
      <Text variant="badge" color={tint.text} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
