/**
 * Two Lisbon places without a photo of their own, for the street-photo tests on recorded Mapillary
 * and model answers: a church whose front a passer-by photographed, and a riverside restaurant
 * whose nearest photo shows the restaurant next door, under that one's sign.
 */
import type { MediaPlace } from '../src/kinds/media/places';

/** When the fixtures were recorded: the source cache answers for a day from then. */
export const STREET_NOW = Date.parse('2026-10-04T13:00:00Z');

export const BLESSED_SACRAMENT: MediaPlace = {
  ref: 'overture:9847486a-15ea-4c90-a2bb-619c51c59eb5',
  destination: 'lisbon',
  name: 'Church of the Blessed Sacrament',
  category: 'temple_shrine',
  lat: 38.711292,
  lng: -9.140396,
};

export const RIVERSIDE_GRILL: MediaPlace = {
  ref: 'fsq_os:4db871236e81c67f61ce0fb1',
  destination: 'lisbon',
  name: 'Atira-te ao rio',
  category: 'food',
  lat: 38.685037,
  lng: -9.157593,
};
