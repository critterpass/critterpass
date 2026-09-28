import { Image, View } from 'react-native';

import { makeStyles, useTheme } from '../theme';

export interface PhotoAvatarProps {
  /** A cut-out PNG (subject with alpha) or a circle-cropped photo. */
  readonly uri: string;
  readonly size: number;
  /** The white sticker outline around a cut-out; a plain circle crop gets a white ring instead. */
  readonly cutout: boolean;
  readonly dimmed?: boolean;
  readonly testID?: string;
}

const useStyles = makeStyles((t) => ({
  ring: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: t.semantic.bg.raised,
  },
}));

/**
 * A real photo avatar with the sticker treatment: the lifted subject sits on a white outline, and a
 * photo with no subject found is shown as a circle with a white ring (the older-device fallback).
 */
export function PhotoAvatar({ uri, size, cutout, dimmed = false, testID }: PhotoAvatarProps) {
  const styles = useStyles();
  const theme = useTheme();
  const white = theme.color.paper.base;
  const outline = Math.max(2, Math.round(size / 24));
  return (
    <View
      testID={testID}
      style={[
        styles.ring,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          borderWidth: outline,
          borderColor: white,
          opacity: dimmed ? 0.7 : 1,
        },
      ]}
    >
      <Image
        source={{ uri }}
        accessibilityIgnoresInvertColors
        resizeMode={cutout ? 'contain' : 'cover'}
        style={
          cutout
            ? {
                width: size - outline * 2,
                height: size - outline * 2,
                // The cut-out's own white edge: a soft white shadow traced around the alpha.
                shadowColor: white,
                shadowOpacity: 1,
                shadowRadius: outline,
                shadowOffset: { width: 0, height: 0 },
              }
            : { width: size, height: size }
        }
      />
    </View>
  );
}
