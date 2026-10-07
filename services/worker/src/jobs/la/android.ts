/**
 * How an object reaches the Android phones of its audience. Play allows Live Updates only for
 * ongoing activities the user began, so the member who started or opted into the object gets a
 * Live Update and everyone else a notification with the same content; a kind with nothing for
 * the others (a leave-by: their own alarm covers it) sends them nothing from here.
 */
import type { LaKind } from '@cp/domain';

import { androidSurfaceFor, type AndroidSurface } from '../../push/fcm-surfaces';
import type { LaSnapshot } from './snapshot';

export type AndroidRoles = Pick<LaSnapshot, 'initiators' | 'optedIn'>;

export function androidSurfaceOf(
  kind: LaKind,
  roles: AndroidRoles,
  userId: string,
): AndroidSurface {
  return androidSurfaceFor(kind, {
    initiator: roles.initiators?.includes(userId) === true,
    optedIn: roles.optedIn?.includes(userId) === true,
  });
}

/**
 * The surface a start may use on one Android phone, or null when the phone gets nothing: no FCM
 * token, nothing for this member, or a Live Update on a phone that reported it cannot show one
 * (notifications off). A notification for the others needs only the token.
 */
export function androidStartSurface(
  kind: LaKind,
  roles: AndroidRoles,
  device: { readonly user_id: string; readonly la_on: boolean; readonly fcm_token: string | null },
): Exclude<AndroidSurface, 'none'> | null {
  if (device.fcm_token === null) return null;
  const surface = androidSurfaceOf(kind, roles, device.user_id);
  if (surface === 'none' || (surface === 'live_update' && !device.la_on)) return null;
  return surface;
}

/** The users the server may start the object for on a phone of `platform`. */
export function startersOn(
  platform: 'ios' | 'android',
  snapshot: Pick<LaSnapshot, 'audience' | 'startAudience' | 'androidStartAudience'>,
): ReadonlySet<string> {
  const ios = snapshot.startAudience ?? snapshot.audience;
  return new Set(platform === 'android' ? (snapshot.androidStartAudience ?? ios) : ios);
}
