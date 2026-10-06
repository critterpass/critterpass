/**
 * Strips the personal details a crew's own text can carry before it is shown to other crews:
 * email addresses, links, phone numbers, booking references and street addresses. Code only and
 * deliberately greedy; a cut word costs less than a leaked phone number.
 */

const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu;
const LINK = /\b(?:https?:\/\/|www\.)\S+/giu;
/** Seven or more digits, allowing spaces, dots, dashes, brackets and a leading plus. */
const PHONE = /\+?\(?\d[\d\s().-]{5,}\d/gu;
/** Five to eight characters mixing capitals and digits, e.g. a PNR or a hotel confirmation. */
const BOOKING_REF = /\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{5,8}\b/gu;
const STREET =
  /\b\d{1,5}[a-z]?\s+(?:[\p{L}'-]+\s){0,3}(?:street|st|road|rd|avenue|ave|lane|ln|đường|phố|ngõ|hẻm|chome|dori|jalan|soi)\b\.?/giu;

const MASK = '…';

export function scrubPublicText(text: string): string {
  return text
    .replace(EMAIL, MASK)
    .replace(LINK, MASK)
    .replace(STREET, MASK)
    .replace(PHONE, MASK)
    .replace(BOOKING_REF, MASK)
    .replace(/(?:…\s*){2,}/gu, MASK)
    .replace(/\s{2,}/gu, ' ')
    .trim();
}
