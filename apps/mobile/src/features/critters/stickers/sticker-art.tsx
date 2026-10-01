/**
 * A shelf sticker's art: the Settled Tokek cheering, a crew-level sticker as the trip guide with the
 * level on a round badge (no crew-level art is designed yet), a special sticker waving.
 */
import { View } from 'react-native';

import { GUIDE_STICKERS, type GuideStickerId } from '@/ui/avatar/guides';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { ShelfItem } from './sticker-model';

const useStyles = makeStyles((th) => ({
  badge: {
    position: 'absolute',
    bottom: 0,
    end: 0,
    minWidth: th.space['24'],
    paddingHorizontal: th.space['4'],
    borderRadius: th.radius.md,
    backgroundColor: th.semantic.action.primary,
    alignItems: 'center',
  },
}));

export function guideArt(slug: string): { readonly kind: string; readonly name: string } {
  const id: GuideStickerId = Object.hasOwn(GUIDE_STICKERS, slug)
    ? (slug as GuideStickerId)
    : 'tokek';
  return GUIDE_STICKERS[id];
}

export function StickerArt({ item, size }: { readonly item: ShelfItem; readonly size: number }) {
  const styles = useStyles();
  const theme = useTheme();
  const art = guideArt(item.guide);
  return (
    <View>
      <Sticker
        kind={art.kind}
        name={art.name}
        size={size}
        pose={item.kind === 'special' ? 'wave' : 'cheer'}
      />
      {item.kind === 'crew_level' && item.level !== null ? (
        <View style={styles.badge}>
          <Text variant="label" color={theme.semantic.text.onAccent}>
            {String(item.level)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
