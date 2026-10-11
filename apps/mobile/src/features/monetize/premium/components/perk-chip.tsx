/**
 * A perk as a white chip with a coloured dot or tick disc (9.12, 9.14, 9.15, 9.21); `paused` greys
 * it and strikes it through (what pauses when the free first trip ends).
 */
import { View } from 'react-native';

import { Icon, Text, usePremiumTheme } from '@/ui/premium';

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
  const bg = paused ? t.color.control : kept ? t.color.status.booked.bg : t.color.card;
  const fg = paused ? t.color.placeholder : kept ? t.color.banner.success.text : t.color.ink;
  const disc = height === 34 ? 22 : 16;
  return (
    <View
      testID={testID}
      style={{
        height,
        borderRadius: height / 2,
        paddingLeft: mark === 'tick' ? 6 : 12,
        paddingRight: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: bg,
        boxShadow: paused || kept ? undefined : t.shadow.float,
      }}
    >
      {paused ? null : mark === 'tick' ? (
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
        <View style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: color }} />
      )}
      <Text
        variant={height === 34 ? 'rowTextStrong' : 'pillSmall'}
        color={fg}
        style={paused ? { textDecorationLine: 'line-through' } : null}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}
