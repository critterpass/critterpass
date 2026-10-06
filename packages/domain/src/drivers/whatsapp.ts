/**
 * WhatsApp hand-offs: every message to a driver is opened in the traveller's own WhatsApp with the
 * text filled in, and the traveller sends it. The server never sends one.
 */

/** `https://wa.me/<digits>?text=`; null when the number is not E.164. */
export function whatsappLink(e164: string, text: string): string | null {
  if (!/^\+[1-9]\d{6,14}$/u.test(e164)) return null;
  const digits = e164.slice(1);
  return text === ''
    ? `https://wa.me/${digits}`
    : `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

/** A Google Maps pin the driver can open without any app of ours. */
export function mapsPin(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat.toFixed(6)},${lng.toFixed(6)}`;
}

/** The `tel:` link for CALL (signal, not data). */
export const telLink = (e164: string): string => `tel:${e164.replace(/[^\d+]/gu, '')}`;
