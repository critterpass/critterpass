import type { ReactNode } from 'react';
import { Image, View } from 'react-native';
import type { ImageSourcePropType } from 'react-native';

import { Text } from '../text/Text';
import { usePremiumTheme } from '../theme/PremiumThemeProvider';

export interface StatTileProps {
  readonly label: string;
  /** The figure, already formatted for the locale and currency ("+$186"). */
  readonly value: string;
  /** A small sticker in the top corner, tilted 8°. */
  readonly sticker?: ReactNode;
  readonly testID?: string;
}

/** A stat tile: r20 card, 12/600 muted label at the top, 26/800 value at the bottom. */
export function StatTile({ label, value, sticker, testID }: StatTileProps) {
  const t = usePremiumTheme();
  return (
    <View
      testID={testID}
      accessible
      accessibilityLabel={`${label}: ${value}`}
      style={{
        minHeight: t.size.statTile,
        borderRadius: t.radius.statTile,
        backgroundColor: t.color.card,
        boxShadow: t.shadow.card,
        paddingVertical: t.space.bannerPadV,
        paddingHorizontal: t.space.rowPadH,
        justifyContent: 'space-between',
      }}
    >
      <Text variant="statLabel" tone="muted">
        {label}
      </Text>
      <Text variant="stat" numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
      {sticker === undefined ? null : (
        <View
          style={{
            position: 'absolute',
            end: t.space.gap8,
            top: t.space.gap6,
            transform: [{ rotate: `${String(t.tilt.statSticker)}deg` }],
          }}
        >
          {sticker}
        </View>
      )}
    </View>
  );
}

export interface PhotoCardProps {
  readonly source: ImageSourcePropType;
  /** What the photo shows, for assistive tech. */
  readonly accessibilityLabel: string;
  /** @default 96 */
  readonly height?: number;
  /** Degrees. @default −3 */
  readonly rotate?: number;
  readonly testID?: string;
}

/** A pinned photo: white 5 pt frame (r18), image r13, tilted, with the photo shadow. Photos stay bright in dark. */
export function PhotoCard({ source, accessibilityLabel, height, rotate, testID }: PhotoCardProps) {
  const t = usePremiumTheme();
  return (
    <View
      testID={testID}
      style={{
        height: height ?? t.size.photoCard,
        padding: t.space.photoFrame,
        borderRadius: t.radius.photoFrame,
        backgroundColor: t.accent.stickerEdge,
        boxShadow: t.shadow.photo,
        transform: [{ rotate: `${String(rotate ?? t.tilt.photo)}deg` }],
      }}
    >
      <Image
        source={source}
        accessibilityLabel={accessibilityLabel}
        resizeMode="cover"
        style={{ flex: 1, width: '100%', borderRadius: t.radius.photoImage }}
      />
    </View>
  );
}
