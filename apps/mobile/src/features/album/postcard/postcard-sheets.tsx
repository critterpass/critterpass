/**
 * The composer's two sheets (undesigned; built from the sheet and field parts): writing the note,
 * with the room left for the chosen format, and choosing the front photo from the album (picks
 * first), or none for the guide's colour.
 */
import { POSTCARD_NOTE_MAX } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { memo, useCallback, useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { TextField } from '@/ui/inputs/TextField';
import { Stack } from '@/ui/layout/Stack';
import { PressScale } from '@/ui/press/PressScale';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { AlbumPhoto } from '../data/album-model';
import { AlbumImage } from '../grid/album-image';
import type { PostcardFormat } from './postcard-pair';

export function NoteSheet({
  note,
  format,
  onDone,
  onClose,
}: {
  readonly note: string;
  readonly format: PostcardFormat;
  readonly onDone: (note: string) => void;
  readonly onClose: () => void;
}) {
  const { t } = useLingui();
  const [value, setValue] = useState(note);
  const max = POSTCARD_NOTE_MAX[format];
  const left = max - value.length;
  const title = t({ id: 'album.postcard.noteTitle', message: 'The note' });
  return (
    <Sheet detents={['fit']} onDismiss={onClose} accessibilityLabel={title} testID="postcard-note">
      <Stack gap="12" padding="16">
        <TextField
          label={title}
          value={value}
          onChangeText={(next) => setValue(next.slice(0, max))}
          multiline
          maxLines={5}
          message={t({ id: 'album.postcard.noteLeft', message: `${left} characters left` })}
          testID="postcard-note-field"
        />
        <PillButton
          label={t({ id: 'album.postcard.noteDone', message: 'Use this note' })}
          onPress={() => onDone(value)}
          block
          testID="postcard-note-done"
        />
      </Stack>
    </Sheet>
  );
}

const THUMB = 96;

const useStyles = makeStyles((t) => ({
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: t.radius.sm,
    overflow: 'hidden',
    backgroundColor: t.color.ink['700'],
  },
  chosen: { borderWidth: 3, borderColor: t.color.yellow },
  gap: { width: t.space['8'] },
}));

const Thumb = memo(function Thumb({
  photo,
  selected,
  onPick,
}: {
  photo: AlbumPhoto;
  selected: boolean;
  onPick: (photoId: string) => void;
}) {
  const { t } = useLingui();
  const styles = useStyles();
  return (
    <PressScale
      onPress={() => onPick(photo.id)}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={t({ id: 'album.postcard.photoOption', message: 'Use this photo' })}
      style={[styles.thumb, selected ? styles.chosen : null]}
      testID={`postcard-photo-${photo.id}`}
    >
      <AlbumImage mediaKey={photo.thumbKey ?? photo.displayKey} failureLine={false} />
    </PressScale>
  );
});

function Gap() {
  return <View style={useStyles().gap} />;
}

export function PhotoSheet({
  photos,
  selected,
  onPick,
  onClose,
}: {
  readonly photos: readonly AlbumPhoto[];
  readonly selected: string | null;
  readonly onPick: (photoId: string | null) => void;
  readonly onClose: () => void;
}) {
  const { t } = useLingui();
  const theme = useTheme();
  const title = t({ id: 'album.postcard.photoTitle', message: 'The front' });
  // Every photo can be the front: picks first, the rest after, in a row that mounts what is near.
  const ordered = useMemo(
    () => [...photos.filter((p) => p.isPick), ...photos.filter((p) => !p.isPick)],
    [photos],
  );
  const pick = useCallback((photoId: string) => onPick(photoId), [onPick]);
  const step = THUMB + theme.space['8'];
  return (
    <Sheet
      detents={['fit']}
      onDismiss={onClose}
      accessibilityLabel={title}
      testID="postcard-photos"
    >
      <Stack gap="12" padding="16">
        <Text variant="h3" accessibilityRole="header">
          {title}
        </Text>
        {ordered.length === 0 ? (
          <Text variant="body" singleLine={false}>
            {t({
              id: 'album.postcard.noPhotos',
              message: "No photos in the album yet, so the front is the guide's colour.",
            })}
          </Text>
        ) : (
          <FlatList
            horizontal
            data={ordered}
            keyExtractor={(photo) => photo.id}
            extraData={selected}
            showsHorizontalScrollIndicator={false}
            ItemSeparatorComponent={Gap}
            getItemLayout={(_, index) => ({ length: step, offset: step * index, index })}
            initialNumToRender={6}
            windowSize={5}
            renderItem={({ item }) => (
              <Thumb photo={item} selected={item.id === selected} onPick={pick} />
            )}
          />
        )}
        <PillButton
          label={t({ id: 'album.postcard.noPhoto', message: 'No photo' })}
          onPress={() => onPick(null)}
          variant="secondary"
          testID="postcard-photo-none"
        />
      </Stack>
    </Sheet>
  );
}
