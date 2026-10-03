/**
 * The Geofabrik extract each box is cut from: the smallest regional extract that holds the whole
 * buffered box (Geofabrik has no Vietnam, Mexico or Thailand subregions; Indonesia and Japan are
 * split). Hand-kept beside `boxes.json`: a destination added there needs its region here, and the
 * `regions` test fails until it has one. The tile workflow checks every URL before downloading.
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

export function regionUrl(region: string): string {
  return `${GEOFABRIK_BASE_URL}/${region}-latest.osm.pbf`;
}
