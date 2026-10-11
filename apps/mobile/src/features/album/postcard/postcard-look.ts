/**
 * How the postcard composer looks: its view and its two sheets (the note and the front photo). The
 * current look by default; the premium look passes its own with the same props.
 */
import type { ComponentProps, ComponentType } from 'react';

import { NoteSheet, PhotoSheet } from './postcard-sheets';
import { PostcardView, type PostcardViewProps } from './postcard-view';

export type NoteSheetProps = ComponentProps<typeof NoteSheet>;
export type PhotoSheetProps = ComponentProps<typeof PhotoSheet>;

export interface PostcardLook {
  readonly View: ComponentType<PostcardViewProps>;
  readonly Note: ComponentType<NoteSheetProps>;
  readonly Photo: ComponentType<PhotoSheetProps>;
}

export const CURRENT_POSTCARD_LOOK: PostcardLook = {
  View: PostcardView,
  Note: NoteSheet,
  Photo: PhotoSheet,
};
