/* eslint-disable lingui/no-unlocalized-strings -- form field names, not UI copy. */
/**
 * The quote form as a reply: the price (digits only, whatever separators the driver typed), what it
 * includes, overtime, the car, new times per stop (only the ones the driver changed) with a note
 * per day, and tips. Validation is the api's own schema, so the page and the api never disagree.
 */
import {
  DRIVER_PLAN_INCLUDES,
  DRIVER_PLAN_MAX_TIPS,
  driverPlanReplyPayloadSchema,
  type DriverPlanInclude,
  type DriverPlanReplyPayload,
} from '@cp/domain';

export const REPLY_CURRENCY = 'IDR';

export type ReplyFormResult =
  | { readonly ok: true; readonly reply: DriverPlanReplyPayload }
  | { readonly ok: false; readonly fields: readonly string[] };

/** "Rp 700.000", "700,000" or "700000" → 700000; blank → null. */
export function parseAmount(raw: FormDataEntryValue | null): number | null {
  if (typeof raw !== 'string') return null;
  const digits = raw.replace(/\D/gu, '');
  return digits === '' ? null : Number(digits);
}

function text(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === 'string' ? value.trim() : '';
}

export function parseReplyForm(form: FormData): ReplyFormResult {
  const price = parseAmount(form.get('price'));
  const includes = form
    .getAll('include')
    .filter(
      (v): v is DriverPlanInclude =>
        typeof v === 'string' && (DRIVER_PLAN_INCLUDES as readonly string[]).includes(v),
    );
  const hours = parseAmount(form.get('hours'));
  const car = text(form, 'car');
  const quote =
    price === null
      ? null
      : {
          price_per_day_minor: price,
          currency: REPLY_CURRENCY,
          includes,
          overtime_per_hour_minor: parseAmount(form.get('overtime')),
          included_hours: hours,
          car: car === '' ? null : car,
        };

  const days = new Map<number, { retime: { ref: string; at: string }[]; note?: string }>();
  for (const [key, value] of form.entries()) {
    const match = /^time:(\d+):([0-9a-f-]{36})$/u.exec(key);
    if (match === null || typeof value !== 'string' || value === '') continue;
    const dayNo = Number(match[1]);
    const ref = match[2] as string;
    if (value === text(form, `was:${dayNo}:${ref}`)) continue;
    const day = days.get(dayNo) ?? { retime: [] };
    day.retime.push({ ref, at: value });
    days.set(dayNo, day);
  }
  for (const [key, value] of form.entries()) {
    const match = /^note:(\d+)$/u.exec(key);
    if (match === null || typeof value !== 'string' || value.trim() === '') continue;
    const dayNo = Number(match[1]);
    days.set(dayNo, { retime: days.get(dayNo)?.retime ?? [], note: value.trim() });
  }
  const tips = form
    .getAll('tip')
    .map((v) => (typeof v === 'string' ? v.trim() : ''))
    .filter((v) => v !== '')
    .slice(0, DRIVER_PLAN_MAX_TIPS + 1)
    .map((tip) => ({ day_no: null, text: tip }));

  const parsed = driverPlanReplyPayloadSchema.safeParse({
    quote,
    days: [...days].map(([day_no, day]) => ({ day_no, order: [], ...day })),
    tips,
  });
  if (parsed.success) return { ok: true, reply: parsed.data };
  const fields = [
    ...new Set(
      parsed.error.issues.map((issue) => {
        const [first] = issue.path;
        return first === undefined ? 'empty' : String(first);
      }),
    ),
  ];
  return { ok: false, fields };
}
