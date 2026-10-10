import { View } from 'react-native';

import { Text } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';

export interface TagProps {
  readonly label: string;
  /** An accent fill (crew or sticker colour). @default sun */
  readonly color?: string;
  /** Degrees; the design tilts tags between −5 and +4. @default −5 */
  readonly rotate?: number;
  readonly testID?: string;
}

/** A sticker tag: 14/800 on an accent, 2.5 white die-cut edge, sticker shadow, tilted. */
export function Tag({ label, color, rotate, testID }: TagProps) {
  const t = usePremiumTheme();
  return (
    <View
      testID={testID}
      style={{
        alignSelf: 'flex-start',
        paddingVertical: t.space.tagPadV,
        paddingHorizontal: t.space.tagPadH,
        borderRadius: t.radius.tag,
        backgroundColor: color ?? t.accent.sun,
        borderWidth: t.size.stickerBorder,
        borderColor: t.accent.stickerEdge,
        boxShadow: t.shadow.sticker,
        transform: [{ rotate: `${String(rotate ?? t.tilt.tag)}deg` }],
      }}
    >
      <Text variant="placeTag" tone="onAccent" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export interface EmptySlotProps {
  readonly label: string;
  readonly testID?: string;
}

/** A slot still to fill: the tag's shape in a 2 pt dashed outline. */
export function EmptySlot({ label, testID }: EmptySlotProps) {
  const t = usePremiumTheme();
  return (
    <View
      testID={testID}
      style={{
        alignSelf: 'flex-start',
        paddingVertical: t.space.tagPadV,
        paddingHorizontal: t.space.rowPadH,
        borderRadius: t.radius.tag,
        borderWidth: t.size.emptyDash,
        borderStyle: 'dashed',
        borderColor: t.color.outlineEmpty,
      }}
    >
      <Text variant="placeTag" tone="muted" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}
