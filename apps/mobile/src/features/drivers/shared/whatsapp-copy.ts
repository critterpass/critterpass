/**
 * The WhatsApp messages the traveller sends a driver from their own WhatsApp: the question about
 * what his price leaves out (6c-2, 6d-1) and the days and pickup pins once he is picked (6d-2).
 */
import { whatsappLink } from '@cp/domain';
import type { useLingui } from '@lingui/react/macro';

type T = ReturnType<typeof useLingui>['t'];

export function askMessage(
  t: T,
  name: string,
  missing: readonly string[],
  overtimeUnknown: boolean,
): string {
  const items = [...missing.map((item) => item.toLowerCase())];
  const list = items.join(', ');
  const overtime = overtimeUnknown
    ? t({ id: 'drivers.wa.overtime', message: ' And what do you charge an hour for overtime?' })
    : '';
  return items.length === 0
    ? t({ id: 'drivers.wa.askOvertime', message: `Hi ${name}, thanks!${overtime}` })
    : t({
        id: 'drivers.wa.ask',
        message: `Hi ${name}, thanks! Does your price include ${list}?${overtime}`,
      });
}

export interface TellDay {
  readonly label: string;
  readonly window: string | null;
  readonly pin: string | null;
}

export function tellMessage(t: T, name: string, days: readonly TellDay[]): string {
  const lines = days.map((day) =>
    [day.label, day.window, day.pin].filter((part): part is string => part !== null).join(' · '),
  );
  return t({
    id: 'drivers.wa.tell',
    message: `Hi ${name}, we'd like to book you for:\n${lines.join('\n')}\nDoes that work for you?`,
  });
}

export const whatsappAsk = (phone: string | null, text: string): string | null =>
  phone === null ? null : whatsappLink(phone, text);
