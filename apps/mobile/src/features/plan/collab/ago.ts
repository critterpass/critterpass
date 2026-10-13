import { format } from '@cp/i18n';

/** "4m", "2h", "3d" since a moment, in the reader's locale. */
export function ago(locale: string, at: string, now: number): string {
  const minutes = Math.max(0, Math.round((now - Date.parse(at)) / 60_000));
  const [value, unit] =
    minutes < 60
      ? [minutes, 'minute']
      : minutes < 1440
        ? [Math.round(minutes / 60), 'hour']
        : [Math.round(minutes / 1440), 'day'];
  return format.number(locale, value, { style: 'unit', unit, unitDisplay: 'narrow' });
}
