/**
 * How the postcard composer looks: its view, its two sheets (the note and the front photo) and a
 * crewmate's postcard opened read-only.
 */
import type { ComponentType } from 'react';

import type { AlbumPhoto } from '../data/album-model';
import type { GuideId } from '@/ui/people/GuideLine';

import type { POSTCARD_FORMATS } from '@cp/domain';

export interface NoteSheetProps {
  readonly note: string;
  readonly format: PostcardFormat;
  readonly onDone: (note: string) => void;
  readonly onClose: () => void;
}

export interface PhotoSheetProps {
  readonly photos: readonly AlbumPhoto[];
  readonly selected: string | null;
  readonly onPick: (photoId: string | null) => void;
  readonly onClose: () => void;
}

export interface PostcardLook {
  readonly View: ComponentType<PostcardViewProps>;
  readonly Note: ComponentType<NoteSheetProps>;
  readonly Photo: ComponentType<PhotoSheetProps>;
  /** A crewmate's postcard, read-only. */
  readonly Received: ComponentType<ReceivedViewProps>;
}

export interface PostcardViewProps {
  readonly format: PostcardFormat;
  readonly photoKey: string | null;
  readonly photoCaption: string | null;
  readonly place: string;
  readonly note: string;
  readonly signature: string;
  readonly guide: GuideId;
  readonly sending: boolean;
  /** "Done" is saving the traveller's changes before it leaves. */
  readonly closing?: boolean;
  /** The printed order is on its way to the server. */
  readonly mailingPending?: boolean;
  /** "Sent to Mai, Jon and Ana": the last send, when there was one. */
  readonly sentLine: string | null;
  /** Null when the crew is only the sender (nobody to send to). */
  readonly canSend: boolean;
  readonly mailing: React.ReactNode;
  readonly onFormat: (format: PostcardFormat) => void;
  readonly onPhoto: () => void;
  readonly onNote: () => void;
  readonly onSend: () => void;
  readonly onMail: () => void;
  readonly onClose: () => void;
}

export interface PostcardCardProps {
  readonly tripId: string;
  readonly guide: GuideId;
  readonly place: string;
  /** The guide's note from the recap highlights; null before it has written one. */
  readonly note: string | null;
}

export interface ReceivedViewProps {
  readonly sender: string;
  readonly format: PostcardFormat;
  readonly photoKey: string | null;
  readonly place: string;
  readonly note: string;
  readonly guide: GuideId;
  readonly onOwn: () => void;
  readonly onClose: () => void;
}

export type PostcardFormat = (typeof POSTCARD_FORMATS)[number];
