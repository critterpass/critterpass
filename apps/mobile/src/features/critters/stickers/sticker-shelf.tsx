/**
 * The sticker shelf on the PASS's Critterdex, under the cards and above the sets (undesigned in the
 * premium set; built from the kit's sticker and card): the Settled Tokek of every trip the crew
 * squared up and each crew level's sticker, newest first, in a row that scrolls sideways. Tapping
 * one opens how it was earned. With none yet, the card says how to earn one. Stickers are rewards,
 * so they never count in the dex.
 */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { CritterSticker, PressableScale, Text, makePremiumStyles } from '@/ui/premium';

import { guideArt } from './sticker-art';
import { stickerName } from './sticker-copy';
import type { ShelfItem } from './sticker-model';
import { useStickers } from './use-stickers';

const ART = 64;

const useStyles = makePremiumStyles((th) => ({
  card: {
    gap: th.space.gap10,
    paddingVertical: 14,
    borderRadius: 24,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.card,
  },
  head: { paddingHorizontal: 16 },
  row: { paddingHorizontal: 12, gap: th.space.gap10, alignItems: 'flex-end' },
  item: { alignItems: 'center', gap: 4, width: ART + 12 },
  badge: {
    position: 'absolute',
    right: 0,
    bottom: 2,
    minWidth: 22,
    height: 22,
    paddingHorizontal: 4,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: th.accent.sun,
  },
}));

export interface StickerShelfViewProps {
  readonly items: readonly ShelfItem[];
  readonly onOpen: (item: ShelfItem) => void;
}

/** The shelf over a list of stickers; an empty list tells how to earn the first. */
export function StickerShelfView({ items, onOpen }: StickerShelfViewProps) {
  const styles = useStyles();
  const { t, i18n } = useLingui();
  return (
    <View style={styles.card} testID="sticker-shelf">
      <Text variant="label" tone="muted" style={styles.head}>
        {t({ id: 'stickers.shelf.title', message: 'Stickers' }).toLocaleUpperCase(i18n.locale)}
      </Text>
      {items.length === 0 ? (
        <Text
          variant="rowText"
          tone="muted"
          singleLine={false}
          style={styles.head}
          testID="sticker-shelf-empty"
        >
          {t({
            id: 'stickers.shelf.empty',
            message: 'Settle a trip to the last payment or level up your crew to earn one.',
          })}
        </Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
        >
          {items.map((item) => {
            const art = guideArt(item.guide);
            const name = stickerName(i18n, item);
            return (
              <PressableScale
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={name}
                onPress={() => onOpen(item)}
                style={styles.item}
                testID={`sticker-shelf-${item.id}`}
              >
                <View>
                  <CritterSticker
                    kind={art.kind}
                    name={art.name}
                    size={ART}
                    pose={item.kind === 'special' ? 'wave' : 'cheer'}
                  />
                  {item.kind === 'crew_level' && item.level !== null ? (
                    <View style={styles.badge}>
                      <Text variant="avatarInitialSmall" tone="onAccent">
                        {String(item.level)}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text variant="captionMuted" tone="inkSecondary" numberOfLines={1}>
                  {name}
                </Text>
              </PressableScale>
            );
          })}
        </ScrollView>
      )}
    </View>
  );
}

/** The shelf over the synced stickers; drawn once they have loaded. */
export function StickerShelf() {
  const { items, loaded } = useStickers();
  if (!loaded) return null;
  return (
    <StickerShelfView
      items={items}
      onOpen={(item) =>
        // eslint-disable-next-line lingui/no-unlocalized-strings -- a route path, never copy.
        router.push({ pathname: '/(modal)/sticker/[stickerId]', params: { stickerId: item.id } })
      }
    />
  );
}
