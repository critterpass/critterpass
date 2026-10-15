import type { HubFacility, HubModel } from './help-model';
import type { ShareView } from './share-policy';
import type { HelpProblem } from '@cp/domain';
import type { ReactNode } from 'react';

export interface ShareControlsProps {
  readonly crewName: string;
  readonly share: ShareView | null;
  /** The phone has no location permission (the share would have nothing to send). */
  readonly locationDenied: boolean;
  /** +1 H would pass the 3-hour cap. */
  readonly extendCapped: boolean;
  readonly busy: boolean;
  readonly onStart: () => void;
  readonly onStop: () => void;
  readonly onExtend: () => void;
  readonly onSettings: () => void;
}

export interface HelpViewProps {
  readonly hero: HelpHeroProps;
  readonly model: HubModel;
  readonly share: ShareControlsProps;
  /** "Insurance: Chubb Travel · the policy card is in Bookings", or null when none is on file. */
  readonly insurer: string | null;
  readonly playing: boolean;
  readonly onCall: (number: string) => void;
  readonly onProblem: (problem: HelpProblem) => void;
  readonly onGo: (facility: HubFacility) => void;
  readonly onPlay: (() => void) | null;
  readonly onShowPhrase: () => void;
  readonly onSos: (() => void) | null;
  readonly onInsurance: () => void;
  /** The app's help centre (how the app works), for someone who came here looking for that. */
  readonly onHelpCentre?: (() => void) | undefined;
  /** Under SOS: what would keep a crewmate's SOS quiet on this phone (Android). */
  readonly sosAccess?: ReactNode;
}

export interface HelpHeroProps {
  readonly guideName: string;
  readonly guideSticker: { readonly kind: string; readonly name: string } | null;
  readonly placeLabel: string | null;
  /** Hours (rounded up) the crew can still see the traveller; null when not sharing. */
  readonly shareHours: number | null;
  readonly onBack: () => void;
}
