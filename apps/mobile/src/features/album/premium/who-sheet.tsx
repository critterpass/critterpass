/**
 * Long-press on a journal photo: who's in it (travellers who said so themselves), and "I'm in
 * this" for the caller (undesigned; the kit's sheet, avatars and switch). Nobody tags anyone else,
 * and no face data is involved: a tag is just a traveller saying they are in the photo.
 */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { crewColour } from '@/features/vote';
import { Avatar, Text, Toggle } from '@/ui/premium';

import type { WhoSheetProps } from '../grid/album-screen';
import { PremiumSheet } from './premium-sheet';

export function PremiumWhoSheet({ inPhoto, indexOf, meIn, onMeIn, onClose }: WhoSheetProps) {
  const me = t({ id: 'album.who.me', message: "I'm in this" });
  return (
    <PremiumSheet
      title={t({ id: 'album.who.title', message: "Who's in it" })}
      onClose={onClose}
      testID="album-who"
    >
      <View style={{ gap: 12, paddingBottom: 8 }}>
        {inPhoto.length === 0 ? (
          <Text variant="body" tone="muted">
            {t({ id: 'album.who.nobody', message: "Nobody's said they're in this one yet." })}
          </Text>
        ) : (
          inPhoto.map((person) => (
            <View key={person.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Avatar
                name={person.name}
                color={crewColour(indexOf(person.id))}
                uid={person.id}
                size={32}
              />
              <Text variant="body">{person.name}</Text>
            </View>
          ))
        )}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Text variant="rowTextStrong" style={{ flex: 1 }}>
            {me}
          </Text>
          <Toggle value={meIn} onChange={onMeIn} accessibilityLabel={me} testID="album-who-me" />
        </View>
      </View>
    </PremiumSheet>
  );
}
