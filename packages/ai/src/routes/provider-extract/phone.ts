/**
 * A driver's number as E.164, read from the words of the message itself. A number written with its
 * country code keeps it; a local number ("0812…") takes the calling code of the trip's country, and
 * with no country known it is not kept at all. The model only points at the number: what it answers
 * must agree with the digits the message shows.
 */
import { parsePhoneNumberFromString, type PhoneNumber } from 'libphonenumber-js';

const RUN = /\+?\d[\d\s().-]{5,}\d/gu;
const CHAT_LINK = /(?:wa\.me\/|[?&]phone=)\+?(\d{8,15})/iu;

const digits = (text: string) => text.replace(/\D/gu, '');

function possible(number: PhoneNumber | undefined): PhoneNumber | null {
  if (number === undefined) return null;
  if (number.isPossible()) return number;
  // Mexican mobiles were long written "+52 1 55…": the 1 is not part of the number.
  if (number.countryCallingCode === '52' && /^1\d{10}$/u.test(number.nationalNumber)) {
    const fixed = parsePhoneNumberFromString(`+52${number.nationalNumber.slice(1)}`);
    return fixed?.isPossible() === true ? fixed : null;
  }
  return null;
}

/** The numbers written in the words, each as far as its country can be told. */
export function numbersIn(text: string, callingCode: string | null): PhoneNumber[] {
  const link = CHAT_LINK.exec(text);
  if (link !== null) {
    // A chat link always carries the full international number.
    const linked = possible(parsePhoneNumberFromString(`+${link[1]}`));
    if (linked !== null) return [linked];
  }
  const found: PhoneNumber[] = [];
  for (const [run] of text.matchAll(RUN)) {
    const written = run.trim();
    const number = written.startsWith('+')
      ? possible(parsePhoneNumberFromString(written))
      : callingCode === null
        ? null
        : possible(parsePhoneNumberFromString(written, { defaultCallingCode: callingCode }));
    if (number !== null) found.push(number);
  }
  return found;
}

/**
 * The number the model answered as E.164, only when the quoted words of the message hold it.
 * `callingCode` is the trip country's, without `+` ("62"); null when the country is unknown.
 */
export function verifiedPhone(
  value: string,
  quote: string,
  callingCode: string | null,
): string | null {
  const answered = digits(value).replace(/^0+/u, '');
  if (answered.length < 6) return null;
  const match = numbersIn(quote, callingCode).find(
    (number) =>
      answered.endsWith(number.nationalNumber) ||
      // "+52 1 55…" as the model copied it still ends in the national number.
      number.nationalNumber.endsWith(answered),
  );
  if (match === undefined) return null;
  return /^\+[1-9]\d{6,14}$/u.test(match.number) ? match.number : null;
}
