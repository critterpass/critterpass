/**
 * A perk as a white kit chip with a coloured dot or tick disc (9.12, 9.14, 9.15, 9.21); `paused` greys
 * it and strikes it through (what pauses when the free first trip ends).
 */
import { View } from 'react-native';

import { Chip, Icon, usePremiumTheme } from '@/ui/premium';

export interface PerkChipProps {
  readonly label: string;
  /** Dot or tick colour. */
  readonly color: string;
  readonly mark?: 'dot' | 'tick';
  readonly paused?: boolean;
  /** Kept-for-good chips sit on the success tint. */
  readonly kept?: boolean;
  readonly height?: 30 | 34;
  readonly testID?: string;
}

export function PerkChip({
  label,
  color,
  mark = 'dot',
  paused = false,
  kept = false,
  height = 30,
  testID,
}: PerkChipProps) {
  const t = usePremiumTheme();
  const disc = height === 34 ? 22 : 16;
  const leading = paused ? undefined : mark === 'tick' ? (
    <View
      style={{
        width: disc,
        height: disc,
        borderRadius: disc / 2,
        backgroundColor: color,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Icon name="check" size={disc * 0.62} color={t.color.onAccent} />
    </View>
  ) : (
    <View
      style={{ width: 7, height: 7, borderRadius: 3.5, marginLeft: 6, backgroundColor: color }}
    />
  );
  return (
    <Chip
      label={label}
      size={height === 34 ? 'hub' : 'small'}
      surface={paused ? 'control' : kept ? 'tint' : 'white'}
      leading={leading}
      struck={paused}
      color={paused ? t.color.placeholder : undefined}
      testID={testID}
    />
  );
}
