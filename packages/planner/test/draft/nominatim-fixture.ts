/**
 * Nominatim search replies (`format=jsonv2` with `addressdetails`, `namedetails` and `extratags`),
 * written from Nominatim's documented reply format rather than recorded, as the build machine's
 * resolver blocks nominatim.openstreetmap.org. Element ids are illustrative.
 */
import type { NominatimResult } from '@cp/domain';

/** "Patong Beach" near Phuket: the beach (an OSM way) and a hotel named after it. */
const patongBeach = [
  {
    place_id: 104412977,
    licence: 'Data © OpenStreetMap contributors, ODbL 1.0. http://osm.org/copyright',
    osm_type: 'way',
    osm_id: 151234567,
    lat: '7.8935',
    lon: '98.2955',
    category: 'natural',
    type: 'beach',
    place_rank: 22,
    importance: 0.4123,
    addresstype: 'natural',
    name: 'Patong Beach',
    display_name:
      'Patong Beach, Thawewong Road, Patong, Kathu District, Phuket Province, 83150, Thailand',
    address: {
      natural: 'Patong Beach',
      road: 'Thawewong Road',
      suburb: 'Patong',
      town: 'Kathu District',
      state: 'Phuket Province',
      'ISO3166-2-lvl4': 'TH-83',
      postcode: '83150',
      country: 'Thailand',
      country_code: 'th',
    },
    extratags: {
      wikidata: 'Q1928398',
      surface: 'sand',
    },
    namedetails: {
      name: 'หาดป่าตอง',
      'name:en': 'Patong Beach',
      'name:th': 'หาดป่าตอง',
      'name:ru': 'Пляж Патонг',
    },
    boundingbox: ['7.8810', '7.9060', '98.2920', '98.2990'],
  },
  {
    place_id: 104598321,
    licence: 'Data © OpenStreetMap contributors, ODbL 1.0. http://osm.org/copyright',
    osm_type: 'node',
    osm_id: 4412345678,
    lat: '7.8967',
    lon: '98.2981',
    category: 'tourism',
    type: 'hotel',
    place_rank: 30,
    importance: 1e-5,
    addresstype: 'tourism',
    name: 'Patong Beach Hotel',
    display_name:
      'Patong Beach Hotel, 124 Thawewong Road, Patong, Kathu District, Phuket Province, 83150, Thailand',
    address: {
      tourism: 'Patong Beach Hotel',
      house_number: '124',
      road: 'Thawewong Road',
      suburb: 'Patong',
      town: 'Kathu District',
      state: 'Phuket Province',
      postcode: '83150',
      country: 'Thailand',
      country_code: 'th',
    },
    extratags: {
      stars: '3',
      website: 'https://patongbeachhotel.example',
    },
    namedetails: {
      name: 'Patong Beach Hotel',
    },
    boundingbox: ['7.8966', '7.8968', '98.2980', '98.2982'],
  },
];

/** "Hoover Dam": a dam (tags we do not map to a kind), with an alternative name and hours. */
const hooverDam = [
  {
    place_id: 297654321,
    licence: 'Data © OpenStreetMap contributors, ODbL 1.0. http://osm.org/copyright',
    osm_type: 'way',
    osm_id: 39876543,
    lat: '36.0157',
    lon: '-114.7377',
    category: 'waterway',
    type: 'dam',
    place_rank: 30,
    importance: 0.5871,
    addresstype: 'waterway',
    name: 'Hoover Dam',
    display_name:
      'Hoover Dam, Hoover Dam Access Road, Boulder City, Clark County, Nevada, 89005, United States',
    address: {
      waterway: 'Hoover Dam',
      road: 'Hoover Dam Access Road',
      city: 'Boulder City',
      county: 'Clark County',
      state: 'Nevada',
      'ISO3166-2-lvl4': 'US-NV',
      postcode: '89005',
      country: 'United States',
      country_code: 'us',
    },
    extratags: {
      wikidata: 'Q131138',
      opening_hours: 'Mo-Su 09:00-17:00',
      website: 'https://www.usbr.gov/lc/hooverdam/',
    },
    namedetails: {
      name: 'Hoover Dam',
      alt_name: 'Boulder Dam',
    },
    boundingbox: ['36.0140', '36.0175', '-114.7390', '-114.7360'],
  },
];

/**
 * "Clarke Quay" in Singapore: the bus stop, the MRT station, the neighbourhood and the riverside
 * walk all carry the quay's name. Element ids, tags and points are OpenStreetMap's (read through
 * Overpass); the bus stop is the nearest to the researcher's point.
 */
const element = (
  osm_type: string,
  osm_id: number,
  [lat, lon]: [string, string],
  [category, type]: [string, string],
  extratags: Record<string, string> = {},
) => ({
  osm_type,
  osm_id,
  lat,
  lon,
  category,
  type,
  name: 'Clarke Quay',
  address: { road: 'River Valley Road', suburb: 'Clarke Quay', city: 'Singapore' },
  extratags,
  namedetails: { name: 'Clarke Quay', 'name:zh': '克拉码头' },
});

const clarkeQuay = [
  element('node', 410473631, ['1.2904609', '103.8471469'], ['highway', 'bus_stop'], {
    public_transport: 'platform',
  }),
  element('way', 743599220, ['1.2882602', '103.8465975'], ['railway', 'station'], {
    public_transport: 'station',
  }),
  element('node', 2601316092, ['1.2895991', '103.8445791'], ['place', 'neighbourhood'], {
    admin_level: '7',
  }),
  element('way', 149965088, ['1.2912094', '103.8440168'], ['highway', 'pedestrian']),
];

// Whole replies, with the fields the lookup does not read (place_id, licence, display_name...).
export const PATONG_BEACH_REPLY: readonly NominatimResult[] = patongBeach;
export const HOOVER_DAM_REPLY: readonly NominatimResult[] = hooverDam;
export const CLARKE_QUAY_REPLY: readonly NominatimResult[] = clarkeQuay;
