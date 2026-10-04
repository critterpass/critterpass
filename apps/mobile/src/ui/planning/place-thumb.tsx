/**
 * A place's square picture in a row or card (7c-3, 7f-2, 7c-2): its photo when there is one, a
 * striped tile otherwise, with the category's doodle in a paper disc at the corner. A photo that
 * does not load (no signal) leaves the tile as it is without one.
 *
 * A generic photo (stock standing in for the place) never passes for the place itself: on a card's
 * picture (92 pt and up) it carries the "Not this place" line, on a row's small picture a squiggle
 * in an ink disc at the top corner, where the words would not fit.
 */
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { Image, View, type ImageSourcePropType } from 'react-native';

import { Icon } from '../icons/Icon';
import type { DoodleName } from '../icons/generated';
import { Text } from '../text/Text';
import { makeStyles, useTheme } from '../theme';

export interface PlaceThumbProps {
  readonly photo?: ImageSourcePropType | undefined;
  /** The photo is a stock one standing in for the place, so the tile says it is not this place. */
  readonly genericPhoto?: boolean | undefined;
  readonly icon?: DoodleName | undefined;
  readonly size?: number | undefined;
  /** The tile's colour when there is no photo (the place's colour). */
  readonly tint?: string | undefined;
}

/** From this size up the generic photo's line fits; smaller tiles take the corner mark. */
export const GENERIC_LABEL_MIN_SIZE = 92;
/** Under this size the tile is a chip's picture, with a smaller mark. */
const CHIP_SIZE = 38;
/**
 * Under this size (an Ideas row's 38 pt picture, a chip's) the corners tighten and the category
 * badge shrinks into the corner, so the tile stays a rounded square and the photo shows.
 */
const SMALL_SIZE = 44;

const useStyles = makeStyles((t) => ({
  tile: { borderRadius: t.radius.md, overflow: 'hidden' },
  chip: { borderRadius: t.radius.sm },
  fill: { width: '100%', height: '100%' },
  disc: {
    position: 'absolute',
    start: t.space['4'],
    bottom: t.space['4'],
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: t.color.paper.bright,
    alignItems: 'center',
    justifyContent: 'center',
  },
  smallDisc: {
    start: t.space['2'],
    bottom: t.space['2'],
    width: 16,
    height: 16,
    borderRadius: 8,
  },
  mark: {
    position: 'absolute',
    end: t.space['2'],
    top: t.space['2'],
    backgroundColor: t.semantic.bg.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    position: 'absolute',
    start: 0,
    end: 0,
    top: 0,
    paddingHorizontal: t.space['6'],
    paddingVertical: t.space['2'],
    backgroundColor: t.semantic.bg.base,
    opacity: 0.85,
  },
}));

export function PlaceThumb({
  photo,
  genericPhoto = false,
  icon,
  size = 44,
  tint,
}: PlaceThumbProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { t } = useLingui();
  // Which photo is on screen: the generic mark never sits on a tile whose photo did not load.
  const [loaded, setLoaded] = useState<ImageSourcePropType | null>(null);
  const [failed, setFailed] = useState<ImageSourcePropType | null>(null);
  const shown = photo !== undefined && failed !== photo;
  const generic = genericPhoto && shown && loaded === photo;
  const mark = size < CHIP_SIZE ? 10 : 14;
  return (
    <View
      style={[
        styles.tile,
        size < SMALL_SIZE ? styles.chip : null,
        { width: size, height: size, backgroundColor: tint ?? theme.color.ink[700] },
      ]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {shown ? (
        <Image
          source={photo}
          style={styles.fill}
          resizeMode="cover"
          onLoad={() => setLoaded(photo)}
          onError={() => setFailed(photo)}
          testID="place-thumb-photo"
        />
      ) : null}
      {icon === undefined ? null : (
        <View style={[styles.disc, size < SMALL_SIZE ? styles.smallDisc : null]}>
          <Icon
            name={icon}
            size={size < SMALL_SIZE ? 10 : 14}
            color={theme.color.paper.ink}
            decorative
          />
        </View>
      )}
      {!generic ? null : size >= GENERIC_LABEL_MIN_SIZE ? (
        <View style={styles.label} testID="place-thumb-generic-label">
          <Text variant="caption" color={theme.semantic.text.secondary} numberOfLines={1}>
            {t({ id: 'kit.placeThumb.notThisPlace', message: 'Not this place' })}
          </Text>
        </View>
      ) : (
        <View
          style={[styles.mark, { width: mark, height: mark, borderRadius: mark / 2 }]}
          testID="place-thumb-generic-mark"
        >
          <Icon name="squiggle" size={mark - 4} color={theme.semantic.text.primary} decorative />
        </View>
      )}
    </View>
  );
}
