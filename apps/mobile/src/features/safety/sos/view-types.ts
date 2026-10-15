import type { SosModel } from './sos-model';
import type { SosMessage } from './use-sos';

export interface SosViewProps {
  readonly hero: SosHeroProps;
  readonly steps: Omit<SosStepsProps, 'model'>;
  readonly model: SosModel;
  readonly general: string;
  readonly senderPhone: string | null;
  readonly busy: boolean;
  readonly onGoing: () => void;
  readonly onCallSender: () => void;
  readonly onCallGeneral: () => void;
  readonly onOk: () => void;
  /** A crewmate who went says the sender is safe. */
  readonly onSafe: () => void;
  readonly onSendAgain: () => void;
  readonly onClose: () => void;
  /** The session map: where the sender is, and the way there on foot. */
  readonly onMap: () => void;
}

export interface SosStepsProps {
  readonly model: SosModel;
  readonly guideName: string;
  readonly guideSticker: { readonly kind: string; readonly name: string };
}

export interface SosHeroProps {
  readonly model: SosModel;
  readonly words: string;
  readonly message: SosMessage | null;
  readonly distanceM: number | null;
}
