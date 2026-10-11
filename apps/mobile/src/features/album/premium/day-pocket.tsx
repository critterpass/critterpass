/**
 * A journal pocket (8.12): two polaroids tipped out of a white pocket, the day's tag on it at a
 * tilt, a sticker, the faces of who took the photos, then the day's title and count. Tapping it
 * opens the day's first photo in the viewer.
 */
import { plural, t } from '@lingui/core/macro';
import { View } from 'react-native';

import {
  CrewStack,
  CritterSticker,
  PressableScale,
  Tag,
  Text,
  makePremiumStyles,
  usePremiumTheme,
  type CrewMember,
} from '@/ui/premium';

import type { AlbumPhoto } from '../data/album-model';
import { AlbumImage } from '../grid/album-image';

export interface Pocket {
  readonly key: string;
  readonly title: string;
  readonly tag: string;
  readonly photos: readonly AlbumPhoto[];
  readonly faces: readonly CrewMember[];
}

const POLAROID_TILTS = [-7, 6] as const;

const useStyles = makePremiumStyles((th) => ({
  stack: { height: 150 },
  polaroid: {
    position: 'absolute',
    top: 0,
    width: 84,
    height: 66,
    padding: 3,
    borderRadius: 10,
    backgroundColor: th.color.card,
    boxShadow: th.shadow.card,
  },
  photo: { flex: 1, borderRadius: 7, overflow: 'hidden', backgroundColor: th.color.control },
  pocket: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 40,
    bottom: 0,
    borderRadius: 22,
    padding: 12,
    justifyContent: 'space-between',
    backgroundColor: th.color.card,
    boxShadow: th.shadow.raised,
  },
  sticker: { position: 'absolute', top: -14, right: 6 },
}));

export function DayPocket({
  pocket,
  stickerKind,
  onOpen,
}: {
  readonly pocket: Pocket;
  readonly stickerKind: string;
  readonly onOpen: (photoId: string) => void;
}) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const first = pocket.photos[0];
  const count = pocket.photos.length;
  return (
    <PressableScale
      style={{ flex: 1, gap: 6 }}
      onPress={() => first !== undefined && onOpen(first.id)}
      accessibilityRole="button"
      accessibilityLabel={`${pocket.title}, ${String(count)}`}
      testID={`album-pocket-${pocket.key}`}
    >
      <View style={styles.stack}>
        {pocket.photos.slice(0, 2).map((photo, index) => (
          <View
            key={photo.id}
            style={[
              styles.polaroid,
              index === 0 ? { left: 8 } : { right: 8 },
              { transform: [{ rotate: `${POLAROID_TILTS[index] ?? 0}deg` }] },
            ]}
          >
            <View style={styles.photo}>
              <AlbumImage mediaKey={photo.thumbKey ?? photo.displayKey} failureLine={false} />
            </View>
          </View>
        ))}
        <View style={styles.pocket}>
          <View style={{ alignSelf: 'flex-start', marginTop: 4 }}>
            <Tag label={pocket.tag} color={th.accent.sun} rotate={-4} />
          </View>
          <CrewStack
            members={pocket.faces}
            size={22}
            max={4}
            accessibilityLabel={pocket.faces.map((face) => face.name).join(', ')}
          />
          <View style={[styles.sticker, { transform: [{ rotate: `${STICKER_TILT}deg` }] }]}>
            <CritterSticker kind={stickerKind} name={pocket.title} size={44} />
          </View>
        </View>
      </View>
      <View style={{ paddingHorizontal: 4 }}>
        <Text variant="rowTitle" numberOfLines={1}>
          {pocket.title}
        </Text>
        <Text variant="captionMuted" tone="muted">
          {t({
            id: 'album.premium.photoCount',
            message: plural(count, { one: '# photo', other: '# photos' }),
          })}
        </Text>
      </View>
    </PressableScale>
  );
}

/** The pocket sticker's tilt, as drawn. */
const STICKER_TILT = 10;
