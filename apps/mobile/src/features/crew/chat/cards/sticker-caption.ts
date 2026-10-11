/**
 * The caption a critter sticker wears, fixed per pose and localised on the phone (the message only
 * stores the pose). Shared by the chat's sticker card, the sticker tray and push copy previews.
 */
import { STICKER_POSES, type StickerPose } from '@cp/domain';
import { t } from '@lingui/core/macro';

export function isStickerPose(value: string): value is StickerPose {
  return (STICKER_POSES as readonly string[]).includes(value);
}

export function stickerCaption(pose: StickerPose): string {
  switch (pose) {
    case 'wave':
      return t({ id: 'chat.sticker.caption.wave', message: 'hi!' });
    case 'cheer':
      return t({ id: 'chat.sticker.caption.cheer', message: 'yes pls' });
    case 'think':
      return t({ id: 'chat.sticker.caption.think', message: 'hmm' });
    case 'point':
      return t({ id: 'chat.sticker.caption.point', message: 'omw' });
    case 'sleep':
      return t({ id: 'chat.sticker.caption.sleep', message: 'zzz' });
  }
}
