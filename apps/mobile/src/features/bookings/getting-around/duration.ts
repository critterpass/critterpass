/** The header's driving time: "1h 05m" from an hour up, "28m" under an hour (3h-3). */
import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';

export function durationMessage(minutes: number): MessageDescriptor {
  const whole = Math.max(0, Math.round(minutes));
  const hours = Math.floor(whole / 60);
  const rest = String(whole % 60).padStart(2, '0');
  const mins = whole;
  return hours > 0
    ? msg({ id: 'suppliers.around.hours', message: `${hours}h ${rest}m` })
    : msg({ id: 'suppliers.around.minutesShort', message: `${mins}m` });
}
