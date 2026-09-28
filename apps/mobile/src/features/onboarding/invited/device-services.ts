/**
 * The invited path's services on a device: link previews through the app's signed-in links
 * client (the same one the first-launch claim uses), the guide's welcome line and the wall clock.
 */
import { fetchCrewWelcome } from '@/data/ai/guide-lines';
import { deviceLinkClaims, deviceSessionUid } from '@/data/app-session/device-session';

import type { InviteServices } from './invite-services';

export function deviceInviteServices(): InviteServices {
  return {
    preview: (target) => deviceLinkClaims.client.preview(target),
    welcome: fetchCrewWelcome,
    uid: deviceSessionUid,
    now: () => Date.now(),
  };
}
