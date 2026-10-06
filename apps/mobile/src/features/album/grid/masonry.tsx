/**
 * A day's photos as the design's masonry: three columns, a feature row (one photo two columns
 * wide and two rows tall beside two small ones), then a wide row, repeating, with an even row for
 * what is left. Sizes come from the measured width, so a photo dropping in never reflows rows
 * above it.
 */
import { useState } from 'react';
import { View } from 'react-native';

import { makeStyles, useTheme } from '@/ui/theme';

import { masonryRows, type AlbumPhoto } from '../data/album-model';
import { PhotoTile } from './photo-tile';

const ROW_RATIO = 0.82;

export interface MasonryProps {
  readonly photos: readonly AlbumPhoto[];
  readonly nameOf: (uid: string) => string;
  readonly indexOf: (uid: string) => number;
  readonly onOpen: (photoId: string) => void;
  readonly onWho: (photoId: string) => void;
}

const useStyles = makeStyles((t) => ({
  rows: { gap: t.space['8'] },
  row: { flexDirection: 'row', gap: t.space['8'] },
  column: { gap: t.space['8'] },
}));

export function Masonry({ photos, nameOf, indexOf, onOpen, onWho }: MasonryProps) {
  const styles = useStyles();
  const theme = useTheme();
  const [width, setWidth] = useState(0);
  const gap = theme.space['8'];
  const col = width > 0 ? (width - gap * 2) / 3 : 0;
  const h = col * ROW_RATIO;
  const tints = [
    theme.color.rust.darkened,
    theme.color.blue,
    theme.color.green.deep,
    theme.color.ink['700'],
    theme.color.gold.dark,
  ];
  const tile = (photo: AlbumPhoto, w: number, height: number) => (
    <PhotoTile
      key={photo.id}
      photo={photo}
      uploaderName={nameOf(photo.uploaderId)}
      uploaderIndex={indexOf(photo.uploaderId)}
      tint={tints[photos.indexOf(photo) % tints.length] ?? theme.color.ink['700']}
      onOpen={() => onOpen(photo.id)}
      onWho={() => onWho(photo.id)}
      style={{ width: w, height }}
    />
  );
  return (
    <View style={styles.rows} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      {width === 0
        ? null
        : masonryRows(photos).map((row) => {
            if (row.kind === 'feature') {
              return (
                <View key={row.large.id} style={styles.row}>
                  {tile(row.large, col * 2 + gap, h * 2 + gap)}
                  <View style={styles.column}>{row.small.map((photo) => tile(photo, col, h))}</View>
                </View>
              );
            }
            if (row.kind === 'wide') {
              return (
                <View key={row.wide.id} style={styles.row}>
                  {tile(row.wide, col * 2 + gap, h)}
                  {tile(row.small, col, h)}
                </View>
              );
            }
            return (
              <View key={row.photos[0]?.id ?? 'even'} style={styles.row}>
                {row.photos.map((photo) => tile(photo, col, h))}
              </View>
            );
          })}
    </View>
  );
}
