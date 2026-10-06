/**
 * The Geofabrik extract each box is cut from: the smallest regional extract that holds the whole
 * buffered box (Geofabrik has no Vietnam, Mexico or Thailand subregions; Indonesia and Japan are
 * split). A destination named here gets its own extract; any other `<country>-<city>` slug of a
 * country Geofabrik serves as one extract gets that country's (`COUNTRY_REGION`), so a new city
 * there needs no edit. Anything else is reported by the plan and left out of the build.
 */
export const GEOFABRIK_BASE_URL = 'https://download.geofabrik.de';

export const REGION_BY_SLUG: Readonly<Record<string, string>> = {
  bali: 'asia/indonesia/nusa-tenggara',
  'id-labuan-bajo': 'asia/indonesia/nusa-tenggara',
  'id-yogyakarta': 'asia/indonesia/java',
  kyoto: 'asia/japan/kansai',
  'jp-osaka': 'asia/japan/kansai',
  'jp-tokyo': 'asia/japan/kanto',
  'th-bangkok': 'asia/thailand',
  'da-nang': 'asia/vietnam',
  'vn-da-lat': 'asia/vietnam',
  'vn-ha-long': 'asia/vietnam',
  'vn-ha-noi': 'asia/vietnam',
  'vn-hoi-an': 'asia/vietnam',
  'vn-hue': 'asia/vietnam',
  'vn-mekong': 'asia/vietnam',
  'vn-phong-nha': 'asia/vietnam',
  'vn-phu-quoc': 'asia/vietnam',
  'vn-sai-gon': 'asia/vietnam',
  'vn-sa-pa': 'asia/vietnam',
  iceland: 'europe/iceland',
  'is-reykjavik': 'europe/iceland',
  lisbon: 'europe/portugal',
  'pt-algarve': 'europe/portugal',
  'pt-porto': 'europe/portugal',
  'ma-marrakech': 'africa/morocco',
  cusco: 'south-america/peru',
  'mexico-city': 'north-america/mexico',
  'mx-cancun': 'north-america/mexico',
  'mx-guadalajara': 'north-america/mexico',
  'mx-oaxaca': 'north-america/mexico',
  'mx-tulum': 'north-america/mexico',
};

/** Countries Geofabrik serves as one extract, by the ISO code a destination slug starts with. */
export const COUNTRY_REGION: Readonly<Record<string, string>> = {
  vn: 'asia/vietnam',
  th: 'asia/thailand',
  kh: 'asia/cambodia',
  la: 'asia/laos',
  my: 'asia/malaysia-singapore-brunei',
  sg: 'asia/malaysia-singapore-brunei',
  ph: 'asia/philippines',
  is: 'europe/iceland',
  pt: 'europe/portugal',
  ma: 'africa/morocco',
  pe: 'south-america/peru',
  mx: 'north-america/mexico',
};

/** The extract a destination's box is cut from, or undefined when none is known. */
export function regionFor(
  slug: string,
  regions: Readonly<Record<string, string>> = REGION_BY_SLUG,
): string | undefined {
  const named = regions[slug];
  if (named !== undefined) return named;
  const country = /^([a-z]{2})-/.exec(slug)?.[1];
  return country === undefined ? undefined : COUNTRY_REGION[country];
}

export function regionUrl(region: string): string {
  return `${GEOFABRIK_BASE_URL}/${region}-latest.osm.pbf`;
}
