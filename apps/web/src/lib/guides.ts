/* eslint-disable lingui/no-unlocalized-strings -- guide, critter and city names are data, the same
   in every language; the page's copy lives in src/components/site/copy/coming-soon*.ts. */
/**
 * The six boarding-pass guides, matching `guides` in the coming-soon design script. Each guide's
 * `destinationKey` links back to `DESTINATIONS` in `./waitlist` (the chip a visitor picks); `bg` is
 * this page's own colour per guide (a deliberate design choice for this marketing surface — it does
 * not follow the mobile app's canonical `guide.*` token colours).
 */
export interface Guide {
  readonly name: string;
  readonly destinationKey: string;
  readonly city: string;
  readonly place: string;
  readonly species: string;
  readonly kind: string;
  readonly seed: number;
  readonly bg: string;
  readonly no: string;
}

export const GUIDES: readonly Guide[] = [
  {
    name: 'TOKEK',
    destinationKey: 'bali',
    city: 'BALI',
    place: 'Bali',
    species: 'GECKO',
    kind: 'gecko',
    seed: 41,
    bg: 'var(--color-green-base)',
    no: '041',
  },
  {
    name: 'PON',
    destinationKey: 'kyoto',
    city: 'KYOTO',
    place: 'Kyoto',
    species: 'TANUKI',
    kind: 'tanuki',
    seed: 51,
    bg: 'var(--color-orange)',
    no: '051',
  },
  {
    name: 'LUNDI',
    destinationKey: 'iceland',
    city: 'ICELAND',
    place: 'Iceland',
    species: 'PUFFIN',
    kind: 'puffin',
    seed: 43,
    bg: 'var(--color-blue-light)',
    no: '043',
  },
  {
    name: 'AJO',
    destinationKey: 'mexico-city',
    city: 'MEXICO CITY',
    place: 'Mexico City',
    species: 'AXOLOTL',
    kind: 'axolotl',
    seed: 44,
    bg: 'var(--color-pink)',
    no: '044',
  },
  {
    name: 'SARDI',
    destinationKey: 'lisbon',
    city: 'LISBON',
    place: 'Lisbon',
    species: 'SARDINE',
    kind: 'sardine',
    seed: 45,
    bg: 'var(--color-blue)',
    no: '045',
  },
  {
    name: 'PACO',
    destinationKey: 'cusco',
    city: 'CUSCO',
    place: 'Cusco',
    species: 'ALPACA',
    kind: 'alpaca',
    seed: 46,
    bg: 'var(--color-yellow)',
    no: '046',
  },
];

const DEFAULT_GUIDE = GUIDES[0];

export function guideForDestination(destinationKey: string): Guide {
  const found = GUIDES.find((guide) => guide.destinationKey === destinationKey);
  if (found) return found;
  if (!DEFAULT_GUIDE) throw new Error('guides: GUIDES must not be empty');
  return DEFAULT_GUIDE;
}

/** The tilted city ticker's contents (`ticker` in the design script). */
export const CITY_TICKER: readonly { readonly city: string; readonly who: string }[] = [
  { city: 'BALI', who: 'Tokek' },
  { city: 'KYOTO', who: 'Pon' },
  { city: 'REYKJAVÍK', who: 'Lundi' },
  { city: 'MEXICO CITY', who: 'Ajo' },
  { city: 'LISBON', who: 'Sardi' },
  { city: 'CUSCO', who: 'Paco' },
  { city: 'HÀ NỘI', who: 'Cụ Rùa' },
  { city: 'HỘI AN', who: 'Chép' },
  { city: 'PARIS', who: 'Roucou' },
  { city: 'NEW YORK', who: 'Pizza' },
  { city: 'BARCELONA', who: 'Drac' },
  { city: 'NAIROBI', who: 'Twiga' },
];
