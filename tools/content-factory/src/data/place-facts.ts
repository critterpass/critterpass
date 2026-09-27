/**
 * Facts about the 61 places (one critter set each) that the factory treats as inputs, not as model
 * output: ISO country, the languages visitors meet (BCP 47), the main writing system (ISO 15924),
 * the time zone and currency of the place's main visitor city, and the live guide where there is
 * one. The place index release is built on these and validated against them.
 */

export interface PlaceFacts {
  readonly country: string;
  readonly languages: readonly string[];
  readonly script: string;
  readonly tz: string;
  readonly currency: string;
  readonly guide: 'tokek' | 'pon' | 'lundi' | 'ajo' | 'sardi' | 'paco' | null;
  /** `destinations.slug` of the live guide's destination. */
  readonly destination: string | null;
}

// prettier-ignore
export const PLACE_FACTS: Readonly<Record<string, PlaceFacts>> = {
  vn: { country: 'VN', languages: ['vi'], script: 'Latn', tz: 'Asia/Ho_Chi_Minh', currency: 'VND', guide: null, destination: null },
  fr: { country: 'FR', languages: ['fr'], script: 'Latn', tz: 'Europe/Paris', currency: 'EUR', guide: null, destination: null },
  es: { country: 'ES', languages: ['es'], script: 'Latn', tz: 'Europe/Madrid', currency: 'EUR', guide: null, destination: null },
  us: { country: 'US', languages: ['en'], script: 'Latn', tz: 'America/New_York', currency: 'USD', guide: null, destination: null },
  cn: { country: 'CN', languages: ['zh-Hans'], script: 'Hans', tz: 'Asia/Shanghai', currency: 'CNY', guide: null, destination: null },
  tr: { country: 'TR', languages: ['tr'], script: 'Latn', tz: 'Europe/Istanbul', currency: 'TRY', guide: null, destination: null },
  it: { country: 'IT', languages: ['it'], script: 'Latn', tz: 'Europe/Rome', currency: 'EUR', guide: null, destination: null },
  mx: { country: 'MX', languages: ['es'], script: 'Latn', tz: 'America/Mexico_City', currency: 'MXN', guide: 'ajo', destination: 'mexico-city' },
  hk: { country: 'HK', languages: ['zh-Hant', 'en'], script: 'Hant', tz: 'Asia/Hong_Kong', currency: 'HKD', guide: null, destination: null },
  gb: { country: 'GB', languages: ['en'], script: 'Latn', tz: 'Europe/London', currency: 'GBP', guide: null, destination: null },
  de: { country: 'DE', languages: ['de'], script: 'Latn', tz: 'Europe/Berlin', currency: 'EUR', guide: null, destination: null },
  jp: { country: 'JP', languages: ['ja'], script: 'Jpan', tz: 'Asia/Tokyo', currency: 'JPY', guide: 'pon', destination: 'kyoto' },
  gr: { country: 'GR', languages: ['el'], script: 'Grek', tz: 'Europe/Athens', currency: 'EUR', guide: null, destination: null },
  th: { country: 'TH', languages: ['th'], script: 'Thai', tz: 'Asia/Bangkok', currency: 'THB', guide: null, destination: null },
  at: { country: 'AT', languages: ['de'], script: 'Latn', tz: 'Europe/Vienna', currency: 'EUR', guide: null, destination: null },
  sa: { country: 'SA', languages: ['ar'], script: 'Arab', tz: 'Asia/Riyadh', currency: 'SAR', guide: null, destination: null },
  pt: { country: 'PT', languages: ['pt-PT'], script: 'Latn', tz: 'Europe/Lisbon', currency: 'EUR', guide: 'sardi', destination: 'lisbon' },
  my: { country: 'MY', languages: ['ms', 'en'], script: 'Latn', tz: 'Asia/Kuala_Lumpur', currency: 'MYR', guide: null, destination: null },
  nl: { country: 'NL', languages: ['nl'], script: 'Latn', tz: 'Europe/Amsterdam', currency: 'EUR', guide: null, destination: null },
  ca: { country: 'CA', languages: ['en', 'fr'], script: 'Latn', tz: 'America/Toronto', currency: 'CAD', guide: null, destination: null },
  pl: { country: 'PL', languages: ['pl'], script: 'Latn', tz: 'Europe/Warsaw', currency: 'PLN', guide: null, destination: null },
  hr: { country: 'HR', languages: ['hr'], script: 'Latn', tz: 'Europe/Zagreb', currency: 'EUR', guide: null, destination: null },
  ae: { country: 'AE', languages: ['ar', 'en'], script: 'Arab', tz: 'Asia/Dubai', currency: 'AED', guide: null, destination: null },
  ma: { country: 'MA', languages: ['ar', 'fr'], script: 'Arab', tz: 'Africa/Casablanca', currency: 'MAD', guide: null, destination: null },
  hu: { country: 'HU', languages: ['hu'], script: 'Latn', tz: 'Europe/Budapest', currency: 'HUF', guide: null, destination: null },
  sg: { country: 'SG', languages: ['en', 'zh-Hans', 'ms', 'ta'], script: 'Latn', tz: 'Asia/Singapore', currency: 'SGD', guide: null, destination: null },
  kr: { country: 'KR', languages: ['ko'], script: 'Kore', tz: 'Asia/Seoul', currency: 'KRW', guide: null, destination: null },
  eg: { country: 'EG', languages: ['ar'], script: 'Arab', tz: 'Africa/Cairo', currency: 'EGP', guide: null, destination: null },
  id: { country: 'ID', languages: ['id'], script: 'Latn', tz: 'Asia/Makassar', currency: 'IDR', guide: 'tokek', destination: 'bali' },
  ch: { country: 'CH', languages: ['de', 'fr', 'it'], script: 'Latn', tz: 'Europe/Zurich', currency: 'CHF', guide: null, destination: null },
  cz: { country: 'CZ', languages: ['cs'], script: 'Latn', tz: 'Europe/Prague', currency: 'CZK', guide: null, destination: null },
  al: { country: 'AL', languages: ['sq'], script: 'Latn', tz: 'Europe/Tirane', currency: 'ALL', guide: null, destination: null },
  tn: { country: 'TN', languages: ['ar', 'fr'], script: 'Arab', tz: 'Africa/Tunis', currency: 'TND', guide: null, destination: null },
  in: { country: 'IN', languages: ['hi', 'en'], script: 'Deva', tz: 'Asia/Kolkata', currency: 'INR', guide: null, destination: null },
  be: { country: 'BE', languages: ['nl', 'fr'], script: 'Latn', tz: 'Europe/Brussels', currency: 'EUR', guide: null, destination: null },
  za: { country: 'ZA', languages: ['en', 'af', 'zu'], script: 'Latn', tz: 'Africa/Johannesburg', currency: 'ZAR', guide: null, destination: null },
  do: { country: 'DO', languages: ['es'], script: 'Latn', tz: 'America/Santo_Domingo', currency: 'DOP', guide: null, destination: null },
  uz: { country: 'UZ', languages: ['uz'], script: 'Latn', tz: 'Asia/Samarkand', currency: 'UZS', guide: null, destination: null },
  tw: { country: 'TW', languages: ['zh-Hant'], script: 'Hant', tz: 'Asia/Taipei', currency: 'TWD', guide: null, destination: null },
  au: { country: 'AU', languages: ['en'], script: 'Latn', tz: 'Australia/Sydney', currency: 'AUD', guide: null, destination: null },
  ie: { country: 'IE', languages: ['en', 'ga'], script: 'Latn', tz: 'Europe/Dublin', currency: 'EUR', guide: null, destination: null },
  se: { country: 'SE', languages: ['sv'], script: 'Latn', tz: 'Europe/Stockholm', currency: 'SEK', guide: null, destination: null },
  kh: { country: 'KH', languages: ['km'], script: 'Khmr', tz: 'Asia/Phnom_Penh', currency: 'KHR', guide: null, destination: null },
  br: { country: 'BR', languages: ['pt-BR'], script: 'Latn', tz: 'America/Sao_Paulo', currency: 'BRL', guide: null, destination: null },
  ar: { country: 'AR', languages: ['es'], script: 'Latn', tz: 'America/Argentina/Buenos_Aires', currency: 'ARS', guide: null, destination: null },
  co: { country: 'CO', languages: ['es'], script: 'Latn', tz: 'America/Bogota', currency: 'COP', guide: null, destination: null },
  ph: { country: 'PH', languages: ['fil', 'en'], script: 'Latn', tz: 'Asia/Manila', currency: 'PHP', guide: null, destination: null },
  jo: { country: 'JO', languages: ['ar'], script: 'Arab', tz: 'Asia/Amman', currency: 'JOD', guide: null, destination: null },
  cl: { country: 'CL', languages: ['es'], script: 'Latn', tz: 'America/Santiago', currency: 'CLP', guide: null, destination: null },
  qa: { country: 'QA', languages: ['ar', 'en'], script: 'Arab', tz: 'Asia/Qatar', currency: 'QAR', guide: null, destination: null },
  ge: { country: 'GE', languages: ['ka'], script: 'Geor', tz: 'Asia/Tbilisi', currency: 'GEL', guide: null, destination: null },
  no: { country: 'NO', languages: ['nb'], script: 'Latn', tz: 'Europe/Oslo', currency: 'NOK', guide: null, destination: null },
  la: { country: 'LA', languages: ['lo'], script: 'Laoo', tz: 'Asia/Vientiane', currency: 'LAK', guide: null, destination: null },
  om: { country: 'OM', languages: ['ar'], script: 'Arab', tz: 'Asia/Muscat', currency: 'OMR', guide: null, destination: null },
  nz: { country: 'NZ', languages: ['en', 'mi'], script: 'Latn', tz: 'Pacific/Auckland', currency: 'NZD', guide: null, destination: null },
  pe: { country: 'PE', languages: ['es', 'qu'], script: 'Latn', tz: 'America/Lima', currency: 'PEN', guide: 'paco', destination: 'cusco' },
  cr: { country: 'CR', languages: ['es'], script: 'Latn', tz: 'America/Costa_Rica', currency: 'CRC', guide: null, destination: null },
  ke: { country: 'KE', languages: ['sw', 'en'], script: 'Latn', tz: 'Africa/Nairobi', currency: 'KES', guide: null, destination: null },
  is: { country: 'IS', languages: ['is'], script: 'Latn', tz: 'Atlantic/Reykjavik', currency: 'ISK', guide: 'lundi', destination: 'iceland' },
  cu: { country: 'CU', languages: ['es'], script: 'Latn', tz: 'America/Havana', currency: 'CUP', guide: null, destination: null },
  tz: { country: 'TZ', languages: ['sw', 'en'], script: 'Latn', tz: 'Africa/Dar_es_Salaam', currency: 'TZS', guide: null, destination: null },
};

export function placeFacts(code: string): PlaceFacts {
  const facts = PLACE_FACTS[code];
  if (facts === undefined) throw new Error(`no place facts for ${code}`);
  return facts;
}

/** Places whose names are written in a non-Latin script (critters get a native-script name there). */
export function writesInLatin(code: string): boolean {
  return placeFacts(code).script === 'Latn';
}
