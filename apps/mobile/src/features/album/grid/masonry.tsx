/**
 * One row of a day's masonry, as the design lays it out on three columns: a feature row (one photo
 * two columns wide and two rows tall beside two small ones), a wide row, or an even row for what
 * is left. Sizes come from the list's width, so a photo dropping in never reflows rows above it.
 * The album list recycles these rows, so only the ones near the screen are mounted.
 */
import { memo } from 'react';
import { View } from 'react-native';

import { makeStyles, useTheme } from '@/ui/theme';

import type { AlbumPhoto, MasonryRow } from '../data/album-model';
import { PhotoTile } from './photo-tile';

const ROW_RATIO = 0.82;

/** Who uploaded a photo, as the tile shows it. */
export interface TilePerson {
  readonly name: string;
  readonly index: number;
}

export interface MasonryRowProps {
  readonly row: MasonryRow;
  /** The position of the row's first photo in its section. */
  readonly start: number;
  /** The width the three columns share. */
  readonly width: number;
  readonly people: ReadonlyMap<string, TilePerson>;
  readonly formerName: string;
  readonly onOpen: (photoId: string) => void;
  readonly onWho: (photoId: string) => void;
}

const useStyles = makeStyles((t) => ({
  row: { flexDirection: 'row', gap: t.space['8'], paddingBottom: t.space['8'] },
  column: { gap: t.space['8'] },
}));

export const MasonryRowView = memo(function MasonryRowView({
  row,
  start,
  width,
  people,
  formerName,
  onOpen,
  onWho,
}: MasonryRowProps) {
  const styles = useStyles();
  const theme = useTheme();
  const gap = theme.space['8'];
  const col = (width - gap * 2) / 3;
  const h = col * ROW_RATIO;
  const tints = [
    theme.color.rust.darkened,
    theme.color.blue,
    theme.color.green.deep,
    theme.color.ink['700'],
    theme.color.gold.dark,
  ];
  const tile = (photo: AlbumPhoto, at: number, w: number, height: number) => {
    const person = people.get(photo.uploaderId);
    return (
      <PhotoTile
        key={photo.id}
        photo={photo}
        uploaderName={person?.name || formerName}
        uploaderIndex={person?.index ?? 0}
        tint={tints[(start + at) % tints.length] ?? theme.color.ink['700']}
        width={w}
        height={height}
        onOpen={onOpen}
        onWho={onWho}
      />
    );
  };
  if (width <= 0) return null;
  if (row.kind === 'feature') {
    return (
      <View style={styles.row}>
        {tile(row.large, 0, col * 2 + gap, h * 2 + gap)}
        <View style={styles.column}>
          {row.small.map((photo, index) => tile(photo, index + 1, col, h))}
        </View>
      </View>
    );
  }
  if (row.kind === 'wide') {
    return (
      <View style={styles.row}>
        {tile(row.wide, 0, col * 2 + gap, h)}
        {tile(row.small, 1, col, h)}
      </View>
    );
  }
  return (
    <View style={styles.row}>{row.photos.map((photo, index) => tile(photo, index, col, h))}</View>
  );
});
