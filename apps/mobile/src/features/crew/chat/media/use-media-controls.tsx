/**
 * Wires chat media into the screen: the "+" menu (photos from the library or camera, a hands-free
 * voice note, other features' entries), the mic's hold-to-talk and tap-to-record, the recorder bar,
 * and this device's uploads at the foot of the timeline. Without device media (no provider) the
 * composer shows no "+" and no mic actions.
 */
import type { ReactNode } from 'react';

import { useLocalFirst } from '@/data/powersync/local-first-context';

import { AttachMenu } from './attach-menu';
import { useChatMediaActions, type MediaReply } from './use-chat-media-actions';
import { PendingUploads } from './pending-uploads';
import { VoiceRecorderBar } from './voice-recorder';

export type { MediaReply } from './use-chat-media-actions';

export interface MediaControls {
  readonly composer: {
    readonly onAttach?: () => void;
    readonly onMicTap?: () => void;
    readonly onHoldStart?: () => void;
    readonly onHoldEnd?: () => void;
    readonly recording: boolean;
  };
  /** Above the composer: the recorder bar or the microphone's denied card. */
  readonly bar: ReactNode;
  /** In the list footer: uploads in flight. */
  readonly uploads: ReactNode;
  /** How many photo and voice messages of this device are still on their way (or were refused). */
  readonly pending: number;
  /** The attach sheet, when open. */
  readonly sheet: ReactNode;
}

export function useMediaControls(
  crewId: string,
  online: boolean,
  reply?: MediaReply,
): MediaControls {
  const actions = useChatMediaActions(crewId, reply);
  const { network } = useLocalFirst();
  const { recorder, menu, uploads: items } = actions;

  if (!actions.available) {
    return { composer: { recording: false }, bar: null, uploads: null, pending: 0, sheet: null };
  }
  return {
    composer: {
      onAttach: menu.show,
      onMicTap: recorder.onMicTap,
      onHoldStart: recorder.onHoldStart,
      onHoldEnd: recorder.onHoldEnd,
      recording: recorder.state === 'holding' || recorder.state === 'locked',
    },
    bar: (
      <VoiceRecorderBar
        state={recorder.state}
        elapsed={recorder.elapsed}
        onSend={recorder.send}
        onCancel={recorder.cancel}
        onOpenSettings={actions.openSettings}
        onDismissDenied={recorder.dismissDenied}
      />
    ),
    pending: items.length,
    uploads:
      items.length === 0 ? null : (
        <PendingUploads
          items={items}
          online={online && network.isOnline()}
          onRetry={actions.retryUpload}
          onDiscard={actions.discardUpload}
        />
      ),
    sheet: menu.open ? (
      <AttachMenu
        crewId={crewId}
        denied={menu.denied}
        failed={menu.failed}
        onChoose={menu.choose}
        onOpenSettings={actions.openSettings}
        onClose={menu.close}
      />
    ) : null,
  };
}
