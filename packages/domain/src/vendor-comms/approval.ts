/**
 * The approval rule for vendor messages: the ops desk sends only the text its requester approved,
 * byte for byte. The approval (`ops.approvals`, subject `vendor_message`) keeps the text shown; the
 * message keeps the SHA-256 of that text, and a database trigger refuses to mark a message sent
 * unless both still match its body. Any edit is a new draft that needs a new approval.
 */
import type { DeskHours } from './draft';

export const VENDOR_MESSAGE_SUBJECT = 'vendor_message';

/** True only when the approved text is exactly the message body. */
export function approvalMatches(approvedText: string, body: string): boolean {
  return approvedText === body;
}

/** The desk's staffed hours when `desk.hours` is not set (docs/product-decisions.md D10). */
export const DEFAULT_DESK_HOURS: DeskHours = {
  open: '07:00',
  close: '23:00',
  tz: 'Asia/Singapore',
};

/** Minutes the desk has to send an approved message while staffed. */
export const VENDOR_SEND_SLA_MIN = 30;

/** WhatsApp's customer service window: free text only within 24 h of the vendor's last message. */
export const WHATSAPP_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

function minutesOf(clock: string): number {
  const [h, m] = clock.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

/** Minutes past local midnight of `at` in `tz`. */
function localMinutes(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(at);
  const hour = Number(parts.find((part) => part.type === 'hour')?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === 'minute')?.value ?? 0);
  return hour * 60 + minute;
}

export function isDeskOpen(at: Date, hours: DeskHours): boolean {
  const now = localMinutes(at, hours.tz);
  const open = minutesOf(hours.open);
  const close = minutesOf(hours.close);
  return open <= close ? now >= open && now < close : now >= open || now < close;
}

/** When the desk owes the send: the SLA from now while staffed, else from the next opening. */
export function deskDueAt(at: Date, hours: DeskHours, slaMin = VENDOR_SEND_SLA_MIN): Date {
  if (isDeskOpen(at, hours)) return new Date(at.getTime() + slaMin * 60_000);
  const wait = (minutesOf(hours.open) - localMinutes(at, hours.tz) + 24 * 60) % (24 * 60);
  return new Date(at.getTime() + (wait + slaMin) * 60_000 - at.getSeconds() * 1000);
}
