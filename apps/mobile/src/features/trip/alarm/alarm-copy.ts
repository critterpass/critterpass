/**
 * The words a leave-by alarm carries (5b-3), in the reader's language when it is scheduled: the
 * title ("Leave by 03:10 · Batur"), the pickup line, the guide's line and the button labels the
 * native alarm and the notification show.
 */
import { t } from '@lingui/core/macro';

import type { AlarmLabels } from './alarm-port';
import { clockIn } from '../leave-by/model';
import type { DesiredAlarm } from './alarm-plan';

export interface AlarmText {
  /** "Leave-by alarm · Batur", over the time on the app's own alarm screen. */
  readonly eyebrow: string;
  /** "03:10". */
  readonly time: string;
  readonly title: string;
  readonly subtitle: string;
  readonly guideLine: string;
  readonly labels: AlarmLabels;
}

export type AlarmTextInput = Pick<
  DesiredAlarm,
  'leaveAt' | 'tz' | 'placeName' | 'pickup' | 'guideNote'
>;

export function alarmText(alarm: AlarmTextInput, guideName: string, locale: string): AlarmText {
  const time = clockIn(alarm.leaveAt, alarm.tz, locale);
  const place = alarm.placeName;
  const title =
    place === null
      ? t({ id: 'trip.alarm.title', message: `Leave by ${time}` })
      : t({ id: 'trip.alarm.titlePlace', message: `Leave by ${time} · ${place}` });
  const pickupTime = alarm.pickup === null ? null : clockIn(alarm.pickup.at, alarm.tz, locale);
  const pickupPlace = alarm.pickup?.place ?? null;
  const subtitle =
    pickupTime === null
      ? t({ id: 'trip.alarm.subtitle', message: 'Time to get up and get going.' })
      : pickupPlace === null
        ? t({ id: 'trip.alarm.pickup', message: `Pickup at ${pickupTime}` })
        : t({ id: 'trip.alarm.pickupPlace', message: `Pickup at ${pickupPlace} · ${pickupTime}` });
  return {
    eyebrow:
      place === null
        ? t({ id: 'trip.alarm.eyebrow', message: 'Leave-by alarm' })
        : t({ id: 'trip.alarm.eyebrowPlace', message: `Leave-by alarm · ${place}` }),
    time,
    title,
    subtitle,
    guideLine:
      alarm.guideNote ??
      t({ id: 'trip.alarm.guideLine', message: `${guideName} says: up! The day won't wait.` }),
    labels: {
      imUp: t({ id: 'trip.alarm.imUp', message: "I'm up" }),
      slide: t({ id: 'trip.alarm.slide', message: "Slide, I'm up" }),
      snooze: t({ id: 'trip.alarm.snooze', message: 'Snooze 5 min' }),
      snoozeNote: t({ id: 'trip.alarm.snoozeNote', message: `(${guideName} will sigh)` }),
      crewPinged: t({ id: 'trip.alarm.crewPinged', message: 'Crew was pinged' }),
    },
  };
}
