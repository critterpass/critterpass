/**
 * The premium postcard composer's sheets (undesigned): writing the note with the room the format
 * leaves, and picking the front from the album (picks first) or no photo for the guide's colour.
 * Plus the premium composer's look.
 */
import { POSTCARD_NOTE_MAX } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { useMemo, useState } from 'react';
import { FlatList, View } from 'react-native';

import { Button, PressableScale, Text, TextField, makePremiumStyles } from '@/ui/premium';

import { AlbumImage } from '../grid/album-image';
import type { NoteSheetProps, PhotoSheetProps, PostcardLook } from '../postcard/postcard-look';
import { PremiumPostcardScene } from './postcard-scene';
import { PremiumReceivedScene } from './received-scene';
import { PremiumSheet } from './premium-sheet';

const THUMB = 96;

const useStyles = makePremiumStyles((th) => ({
  thumb: {
    width: THUMB,
    height: THUMB,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: th.color.control,
  },
  chosen: { borderWidth: 3, borderColor: th.accent.sun },
}));

export function PremiumNoteSheet({ note, format, onDone, onClose }: NoteSheetProps) {
  const [value, setValue] = useState(note);
  const max = POSTCARD_NOTE_MAX[format];
  const left = max - value.length;
  const title = t({ id: 'album.postcard.noteTitle', message: 'The note' });
  return (
    <PremiumSheet title={title} onClose={onClose} testID="postcard-note">
      <TextField
        accessibilityLabel={title}
        value={value}
        onChangeText={(next) => setValue(next.slice(0, max))}
        multiline
        helper={t({ id: 'album.postcard.noteLeft', message: `${left} characters left` })}
        testID="postcard-note-field"
      />
      <Button
        label={t({ id: 'album.postcard.noteDone', message: 'Use this note' })}
        onPress={() => onDone(value)}
        testID="postcard-note-done"
      />
    </PremiumSheet>
  );
}

export function PremiumPhotoSheet({ photos, selected, onPick, onClose }: PhotoSheetProps) {
  const styles = useStyles();
  const ordered = useMemo(
    () => [...photos.filter((p) => p.isPick), ...photos.filter((p) => !p.isPick)],
    [photos],
  );
  return (
    <PremiumSheet
      title={t({ id: 'album.postcard.photoTitle', message: 'The front' })}
      onClose={onClose}
      testID="postcard-photos"
    >
      {ordered.length === 0 ? (
        <Text variant="body" tone="muted">
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
          ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
          initialNumToRender={6}
          windowSize={5}
          renderItem={({ item }) => (
            <PressableScale
              onPress={() => onPick(item.id)}
              accessibilityRole="button"
              accessibilityState={{ selected: item.id === selected }}
              accessibilityLabel={t({
                id: 'album.postcard.photoOption',
                message: 'Use this photo',
              })}
              style={[styles.thumb, item.id === selected ? styles.chosen : null]}
              testID={`postcard-photo-${item.id}`}
            >
              <AlbumImage mediaKey={item.thumbKey ?? item.displayKey} failureLine={false} />
            </PressableScale>
          )}
        />
      )}
      <Button
        variant="secondary"
        label={t({ id: 'album.postcard.noPhoto', message: 'No photo' })}
        onPress={() => onPick(null)}
        testID="postcard-photo-none"
      />
    </PremiumSheet>
  );
}

export const PREMIUM_POSTCARD_LOOK: PostcardLook = {
  View: PremiumPostcardScene,
  Note: PremiumNoteSheet,
  Photo: PremiumPhotoSheet,
  Received: PremiumReceivedScene,
};
