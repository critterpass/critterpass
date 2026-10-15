/** Voice mode behind its consent, and what the view that asks for it is given. */
import type { ComponentType, ReactNode } from 'react';
import type { VoiceConsentStatus } from './voice-consent';

export interface VoiceConsentViewProps {
  readonly guideName: string;
  readonly sticker: ReactNode;
  /** The guide's critter kind, for a view that draws the guide itself. */
  readonly guideKind?: string;
  readonly onAgree: () => void;
  /** The yes is on its way to the server, or waiting for a connection to go. */
  readonly pending?: 'sending' | 'needs_connection' | null;
  /** Back to the guide sheet, to type instead. */
  readonly onType: () => void;
}

export interface VoiceGateProps extends VoiceConsentViewProps {
  readonly status: VoiceConsentStatus;
  /** Voice mode itself; mounted only once the consent stands. */
  readonly children: ReactNode;
  /** The view that asks. */
  readonly Consent: ComponentType<VoiceConsentViewProps>;
}

/**
 * Voice mode behind its consent: the question while it is needed (its button busy while the yes
 * goes to the server, with a line when there is no connection to send it), nothing while it loads.
 */
export function VoiceGate({ status, children, Consent, ...consent }: VoiceGateProps) {
  if (status === 'loading') return null;
  if (status === 'granted') return <>{children}</>;
  return <Consent {...consent} pending={status === 'needed' ? null : status} />;
}
