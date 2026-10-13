/** What the menu camera's view is given: its state, the camera, the still and the follow-ups. */
import { type ReactNode } from 'react';

import { type MenuScanState } from './menu-scan';
import { type MenuOrder, type MenuSticker } from './menu-scan';

export interface MenuFollowUp {
  readonly id: string;
  readonly label: string;
  readonly onPress: () => void;
}

export interface CameraViewProps {
  readonly guideName: string;
  readonly sticker: ReactNode;
  readonly state: MenuScanState;
  /** The live camera, shown while aiming. */
  readonly camera: ReactNode;
  /** The still that was read (the photo; a drawn menu in the lab). */
  readonly still: ReactNode;
  readonly followUps: readonly MenuFollowUp[];
  /** "Indonesian → English": the menu's language and the reader's, once the guide told it. */
  readonly languages?: string | null;
  /** The order being put together, for the view's own order card. */
  readonly order?: MenuOrderCardProps;
  readonly onScan: () => void;
  readonly onRetake: () => void;
  /** "Ask about this menu": the question goes to the guide with the dishes. */
  readonly onAsk: (question: string) => void;
  readonly onMic?: () => void;
  /** Back to the guide sheet, to type instead. */
  readonly onClose: () => void;
  readonly onOpenSettings?: () => void;
}

export interface MenuOrderCardProps {
  readonly guideName: string;
  readonly crewSize: number;
  readonly stickers: readonly MenuSticker[];
  readonly order: MenuOrder;
  readonly onChange: (id: string, by: 1 | -1) => void;
  /** The order full screen, to show the person taking it. */
  readonly onShow: () => void;
  /** Starts an expense named for the dishes; absent outside a trip. */
  readonly onSplit?: () => void;
  /** Asks the guide what this group should order. */
  readonly onAsk: () => void;
  readonly onClose: () => void;
}
