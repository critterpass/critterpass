/**
 * Country calling codes, so a driver's local number ("0812 …") becomes E.164 for WhatsApp. Covers
 * the countries where crews hire drivers for the day; elsewhere a local number stays unread and
 * the traveller types it with its code.
 */
const CALLING_CODES: Readonly<Record<string, string>> = {
  ID: '62',
  VN: '84',
  TH: '66',
  MY: '60',
  SG: '65',
  PH: '63',
  KH: '855',
  LA: '856',
  MM: '95',
  LK: '94',
  IN: '91',
  NP: '977',
  JP: '81',
  KR: '82',
  CN: '86',
  TW: '886',
  HK: '852',
  AE: '971',
  TR: '90',
  EG: '20',
  MA: '212',
  ZA: '27',
  KE: '254',
  TZ: '255',
  MX: '52',
  PE: '51',
  CO: '57',
  BR: '55',
  AR: '54',
  CL: '56',
  PT: '351',
  ES: '34',
  IT: '39',
  GR: '30',
  FR: '33',
  IS: '354',
  GB: '44',
  US: '1',
  AU: '61',
  NZ: '64',
};

/** The calling code without `+` for an ISO 3166-1 alpha-2 code, or null. */
export const callingCodeFor = (iso2: string | null): string | null =>
  iso2 === null ? null : (CALLING_CODES[iso2.toUpperCase()] ?? null);
