/**
 * How the recap story looks: the player view, the card's footer action, the MVP vote, the
 * not-ready state, the signature sheet and the cards themselves.
 */
import type { Href } from 'expo-router';
import type { ComponentType } from 'react';

import type { StoryCardViews } from './story-card-views';
import { type ReactNode } from 'react';
import type { GuideId } from '@/ui/people/GuideLine';
import { type CardSharer } from './share-card-image';
import type { StoryCardSpec } from './story-cards';
import { type VoiceUrlLoader } from './use-narration';
import type { RecapCard } from '@cp/domain';
import { type uploadStroke } from '../signature/upload';

export interface StoryAbsentProps {
  readonly loaded: boolean;
  readonly summaryHref: Href;
  readonly onOpenRecap: () => void;
}

/** How the story looks. */
export interface StoryLook {
  readonly View: ComponentType<StoryViewProps>;
  readonly Footer: ComponentType<StoryFooterProps>;
  readonly Mvp: ComponentType<MvpSheetProps>;
  readonly Absent: ComponentType<StoryAbsentProps>;
  readonly Signature: ComponentType<SignatureSheetProps>;
  readonly cards: StoryCardViews;
}

export interface StoryViewProps {
  readonly guide: GuideId;
  readonly guideName: string;
  readonly subtitle: string;
  readonly cards: readonly StoryCardSpec[];
  /** The guide's voice plays over the cards (sound is on and the traveller hears the guide). */
  readonly voiceOn: boolean;
  /** Music and voice are on; the switch in the header shows and flips it. */
  readonly soundOn: boolean;
  readonly onToggleSound: () => void;
  readonly onClose: () => void;
  readonly onFinished: () => void;
  /** The playing card's action (vote, remind, sign), or none. */
  readonly footerFor: (card: StoryCardSpec['card']) => ReactNode;
  /** A sheet over the story holds it. */
  readonly held: boolean;
  readonly initialIndex?: number;
  /** Signs a voice clip's URL; the api's read URLs unless a lab scene or test gives its own. */
  readonly loadVoiceUrl?: VoiceUrlLoader;
  /** Shares the playing card's picture; the phone's share sheet unless a test gives its own. */
  readonly shareCard?: CardSharer;
}

export interface StoryFooterProps {
  readonly card: RecapCard;
  readonly canVote: boolean;
  readonly canRemind: boolean;
  readonly reminded: boolean;
  /** The got-away's next window start, for "Remind me in May". */
  readonly nextWindow: string | null;
  readonly canSign: boolean;
  readonly onVote: () => void;
  readonly onRemind: () => void;
  readonly onSign: () => void;
}

export interface MvpChoice {
  readonly awardId: string;
  readonly name: string;
  readonly title: string;
  readonly votes: number;
  readonly mvp: boolean;
}

export interface MvpSheetProps {
  readonly choices: readonly MvpChoice[];
  readonly myVote: string | null;
  readonly closed: boolean;
  readonly onVote: (awardId: string) => void;
  readonly onClose: () => void;
}

export interface SignatureSheetProps {
  readonly name: string;
  readonly onClose: () => void;
  /** Saves the uploaded stroke as the traveller's signature (`save_signature`). */
  /** Saves the signature; false when it did not go through (the caller has said why). */
  readonly onSaved: (mediaId: string) => Promise<boolean>;
  readonly upload?: typeof uploadStroke;
}
