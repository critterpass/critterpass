/**
 * The composer's two sheets (undesigned; built from the sheet and field parts): writing the note,
 * with the room left for the chosen format, and choosing the front photo from the album (picks
 * first), or none for the guide's colour.
 */
import { POSTCARD_NOTE_MAX } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useState } from 'react';
import { Image, Pressable, ScrollView, View } from 'react-native';

import { PillButton } from '@/ui/buttons/PillButton';
import { TextField } from '@/ui/inputs/TextField';
import { Stack } from '@/ui/layout/Stack';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { AlbumPhoto } from '../data/album-model';
import { useAlbumReadUrl } from '../grid/album-media';
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

const useStyles = makeStyles((t) => ({
  thumb: { width: 96, height: 96, borderRadius: t.radius.sm, overflow: 'hidden' },
  row: { gap: t.space['8'] },
}));

function Thumb({
  photo,
  selected,
  onPress,
}: {
  photo: AlbumPhoto;
  selected: boolean;
  onPress: () => void;
}) {
  const { t } = useLingui();
  const styles = useStyles();
  const theme = useTheme();
  const url = useAlbumReadUrl(photo.thumbKey);
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={t({ id: 'album.postcard.photoOption', message: 'Use this photo' })}
      style={[
        styles.thumb,
        { backgroundColor: theme.color.ink['700'] },
        selected ? { borderWidth: 3, borderColor: theme.color.yellow } : null,
      ]}
      testID={`postcard-photo-${photo.id}`}
    >
      {url === null ? null : (
        <Image source={{ uri: url }} style={{ width: '100%', height: '100%' }} />
      )}
    </Pressable>
  );
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
  const styles = useStyles();
  const title = t({ id: 'album.postcard.photoTitle', message: 'The front' });
  const ordered = [...photos.filter((p) => p.isPick), ...photos.filter((p) => !p.isPick)];
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
          <Text variant="body">
            {t({
              id: 'album.postcard.noPhotos',
              message: "No photos in the album yet, so the front is the guide's colour.",
            })}
          </Text>
        ) : (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={[styles.row, { flexDirection: 'row' }]}>
              {ordered.slice(0, 40).map((photo) => (
                <Thumb
                  key={photo.id}
                  photo={photo}
                  selected={photo.id === selected}
                  onPress={() => onPick(photo.id)}
                />
              ))}
            </View>
          </ScrollView>
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
