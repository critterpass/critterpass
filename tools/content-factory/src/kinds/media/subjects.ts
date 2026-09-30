/**
 * What the media batch searches for, per destination: stock photo and video queries, and the
 * named landmarks looked up on Wikimedia Commons. Restaurants and small places get no stock photo
 * (a photo of a different place would mislead); they keep the design's colour and hatch.
 */
export interface MediaSubject {
  /** `destination:<slug>` */
  readonly key: string;
  readonly photos: readonly string[];
  readonly videos: readonly string[];
  readonly landmarks: readonly string[];
}

const destination = (
  slug: string,
  photos: readonly string[],
  videos: readonly string[],
  landmarks: readonly string[],
): MediaSubject => ({ key: `destination:${slug}`, photos, videos, landmarks });

export const MEDIA_SUBJECTS: readonly MediaSubject[] = [
  destination(
    'da-nang',
    [
      'Da Nang Dragon Bridge',
      'Da Nang beach',
      'Da Nang city Han River',
      'Marble Mountains Vietnam',
    ],
    ['Da Nang', 'Da Nang beach'],
    ['Marble Mountains Da Nang', 'Linh Ung Pagoda Son Tra', 'Dragon Bridge Da Nang'],
  ),
  destination(
    'bali',
    ['Bali rice terraces', 'Bali temple', 'Bali beach cliffs'],
    ['Bali rice terrace', 'Bali ocean'],
    ['Tanah Lot', 'Pura Ulun Danu Bratan'],
  ),
  destination(
    'kyoto',
    ['Kyoto Fushimi Inari', 'Kyoto temple', 'Kyoto Gion street'],
    ['Kyoto', 'Kyoto temple'],
    ['Kinkaku-ji', 'Kiyomizu-dera'],
  ),
  destination(
    'iceland',
    ['Iceland waterfall', 'Iceland landscape', 'Iceland black sand beach'],
    ['Iceland waterfall', 'Iceland landscape aerial'],
    ['Skogafoss', 'Jokulsarlon'],
  ),
  destination(
    'mexico-city',
    ['Mexico City skyline', 'Mexico City Zocalo', 'Palacio de Bellas Artes'],
    ['Mexico City', 'Mexico City street'],
    ['Palacio de Bellas Artes', 'Angel de la Independencia'],
  ),
  destination(
    'lisbon',
    ['Lisbon tram', 'Lisbon Alfama rooftops', 'Lisbon city view'],
    ['Lisbon tram', 'Lisbon'],
    ['Torre de Belem', 'Mosteiro dos Jeronimos'],
  ),
  destination(
    'cusco',
    ['Cusco Peru', 'Machu Picchu', 'Cusco Plaza de Armas'],
    ['Machu Picchu', 'Cusco Peru'],
    ['Machu Picchu', 'Cusco Cathedral'],
  ),
];

export function subjectsFor(option: string | undefined): readonly MediaSubject[] {
  if (option === undefined || option === '' || option === 'all') return MEDIA_SUBJECTS;
  const wanted = option.split(',').map((slug) => `destination:${slug.trim()}`);
  const unknown = wanted.filter((key) => !MEDIA_SUBJECTS.some((s) => s.key === key));
  if (unknown.length > 0) throw new Error(`no media subject for ${unknown.join(', ')}`);
  return MEDIA_SUBJECTS.filter((s) => wanted.includes(s.key));
}
