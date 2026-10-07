/**
 * A story card as a picture, handed to the phone's share sheet: the card as it stands on screen
 * (its ground and everything on it, without the story's bars and buttons), written to a temporary
 * PNG the share sheet reads.
 */
/* eslint-disable @typescript-eslint/no-require-imports -- native modules load lazily, so importing this never forces them under Jest. */
/* eslint-disable lingui/no-unlocalized-strings -- file formats, never copy. */
import type * as SharingModule from 'expo-sharing';
import type { ComponentRef, RefObject } from 'react';
import type { View } from 'react-native';

/** A mounted card's native view. */
export type CardView = ComponentRef<typeof View>;

/** The one call used from react-native-view-shot (it ships its source as its types). */
interface ViewShot {
  readonly captureRef: (
    view: RefObject<CardView | null>,
    options: { readonly format: 'png'; readonly result: 'tmpfile' },
  ) => Promise<string>;
}

export type CardSharer = (card: RefObject<CardView | null>, title: string) => Promise<void>;

export const shareCardImage: CardSharer = async (card, title) => {
  const { captureRef } = require('react-native-view-shot') as ViewShot;
  const sharing = require('expo-sharing') as typeof SharingModule;
  const uri = await captureRef(card, { format: 'png', result: 'tmpfile' });
  if (!(await sharing.isAvailableAsync())) return;
  await sharing.shareAsync(uri, { dialogTitle: title, mimeType: 'image/png' });
};
