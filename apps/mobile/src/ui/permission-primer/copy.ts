/**
 * Primer copy per permission kind: what it does for the user, in the guide's plain voice, and
 * what each denied or partial state costs. The words promise only what the app does (no raw
 * trails, off at home); the OS prompt that follows carries the platform usage string.
 */
import type { PermissionKind } from '@/lib/permissions';
import { t } from '@lingui/core/macro';

export interface PrimerCopy {
  readonly title: string;
  readonly body: string;
  /** The primer's primary action ("Turn on"). */
  readonly action: string;
}

export function primerCopy(kind: PermissionKind, always = false): PrimerCopy {
  const action = t({ id: 'permissions.primer.turnOn', message: 'Turn on' });
  switch (kind) {
    case 'notifications':
      return {
        title: t({ id: 'permissions.notifications.title', message: 'Alarms and pings' }),
        body: t({
          id: 'permissions.notifications.body',
          message: 'Leave-by alarms and votes that need you. Only a few a day.',
        }),
        action,
      };
    case 'alarms':
      return {
        title: t({ id: 'permissions.alarms.title', message: 'Real alarms' }),
        body: t({
          id: 'permissions.alarms.body',
          message: 'A proper alarm rings when it is time to leave, even on silent.',
        }),
        action,
      };
    case 'location':
      return always
        ? {
            title: t({ id: 'permissions.locationAlways.title', message: 'Keep finding critters' }),
            body: t({
              id: 'permissions.locationAlways.body',
              message:
                'Allow all the time and critters find you with the phone in your pocket. Trip days only, never a trail.',
            }),
            action: t({ id: 'permissions.locationAlways.action', message: 'Allow all the time' }),
          }
        : {
            title: t({ id: 'permissions.location.title', message: 'Location, on trips' }),
            body: t({
              id: 'permissions.location.body',
              message: 'Critters only appear where you actually are. Off when you are home.',
            }),
            action,
          };
    case 'calendar':
      return {
        title: t({ id: 'permissions.calendar.title', message: 'Calendar' }),
        body: t({
          id: 'permissions.calendar.body',
          message: 'So the guide can find a week everyone can make. Only free and busy.',
        }),
        action,
      };
    case 'camera':
      return {
        title: t({ id: 'permissions.camera.title', message: 'Camera' }),
        body: t({
          id: 'permissions.camera.body',
          message: 'Snap a real photo for your pass. Nothing is taken without your tap.',
        }),
        action,
      };
    case 'microphone':
    case 'speech':
      return {
        title: t({ id: 'permissions.microphone.title', message: 'Talk to your guide' }),
        body: t({
          id: 'permissions.microphone.body',
          message: 'Hold to talk instead of typing. Only while you hold the button.',
        }),
        action,
      };
    case 'photos_add':
      return {
        title: t({ id: 'permissions.photosAdd.title', message: 'Save to photos' }),
        body: t({
          id: 'permissions.photosAdd.body',
          message: 'Save cards and postcards to your photos. Adding only, never reading.',
        }),
        action,
      };
    case 'photos_read':
      return {
        title: t({ id: 'permissions.photosRead.title', message: 'Trip photos' }),
        body: t({
          id: 'permissions.photosRead.body',
          message: 'Pick photos for the crew album. Choose all or just a few.',
        }),
        action,
      };
    case 'live_activities':
      return {
        title: t({ id: 'permissions.liveActivities.title', message: 'Lock screen countdowns' }),
        body: t({
          id: 'permissions.liveActivities.body',
          message: 'Leave-by countdowns on your lock screen. Turned on in Settings.',
        }),
        action: t({ id: 'permissions.primer.openSettings', message: 'Open Settings' }),
      };
  }
}

/** Short state line for a Settings row or a denied card. */
export function statusLine(
  status: string,
  extra: { readonly approximate?: boolean; readonly wiuOnly?: boolean } = {},
): string {
  if (extra.approximate === true) {
    return t({
      id: 'permissions.state.approximate',
      message: 'Approximate only. Critters need precise location near spots.',
    });
  }
  if (extra.wiuOnly === true) {
    return t({
      id: 'permissions.state.whileInUse',
      message: 'While using the app. Critters appear while your trip session runs.',
    });
  }
  switch (status) {
    case 'granted':
      return t({ id: 'permissions.state.on', message: 'On' });
    case 'provisional':
      return t({
        id: 'permissions.state.provisional',
        message: 'Quiet. Pings land in Notification Center.',
      });
    case 'limited':
      return t({ id: 'permissions.state.limited', message: 'Limited' });
    case 'denied':
      return t({ id: 'permissions.state.off', message: 'Off. Turn it on in Settings.' });
    case 'restricted':
      return t({ id: 'permissions.state.restricted', message: 'Not available on this phone' });
    default:
      return t({ id: 'permissions.state.notAsked', message: 'Not asked yet' });
  }
}

export function exactAlarmOffLine(): string {
  return t({
    id: 'permissions.state.exactAlarmOff',
    message: 'Alarms off. Leave-by falls back to a loud notification.',
  });
}

export function liveActivitiesOffLine(): string {
  return t({
    id: 'permissions.state.liveActivitiesOff',
    message: 'Lock screen countdowns off. You still get a notification.',
  });
}
