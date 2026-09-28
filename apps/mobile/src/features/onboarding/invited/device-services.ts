/**
 * The invited path's services on a device: link previews through the app's signed-in links
 * client (the same one the first-launch claim uses) and the wall clock.
 */
import { deviceLinkClaims, deviceSessionUid } from '@/data/app-session/device-session';

import type { InviteServices } from './invite-services';

export function deviceInviteServices(): InviteServices {
  return {
    preview: (target) => deviceLinkClaims.client.preview(target),
    uid: deviceSessionUid,
    now: () => Date.now(),
  };
}
