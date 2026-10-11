/**
 * The premium map style for MapLibre (design `bali-map.html`): the same tiles the app always drew
 * (the world tiles, and a destination's region pack under the `region` source) painted in the
 * light or the night palette. Land is the ground colour, the sea and lakes blue, parks and woods
 * green; roads are drawn as a casing and a fill that widen with the zoom (local roads only from
 * town level in); place names are quiet, towns bold; no shop or point icons (the plan's own pins
 * are the only marks).
 */
/* eslint-disable lingui/no-unlocalized-strings -- MapLibre layer ids, classes and fonts. */
import type { StyleSpecification } from '@maplibre/maplibre-react-native';

import baseStyleJson from '../../../../../assets/map-style/critterpass-dark.json';
import { MAP_PALETTES, type MapMode } from './palette';

type Layer = StyleSpecification['layers'][number];

const base = baseStyleJson as unknown as StyleSpecification;
const FONT = ['Archivo-W100-700 Regular'];
const NAME = ['coalesce', ['get', 'name:latin'], ['get', 'name']];
const MAJOR = ['motorway', 'trunk', 'primary', 'secondary', 'tertiary'];
const MINOR = ['minor', 'service'];

/** Road widths in px: below town level, town level, street level (MapLibre zooms 10 and 12). */
const step = (far: number, town: number, street: number) => [
  'step',
  ['zoom'],
  far,
  10,
  town,
  12,
  street,
];

function layers(mode: MapMode): Layer[] {
  const p = MAP_PALETTES[mode];
  const halo = { 'text-halo-color': p.labelHalo, 'text-halo-width': 1.5, 'text-halo-blur': 0.5 };
  return [
    { id: 'background', type: 'background', paint: { 'background-color': p.land } },
    {
      id: 'world-water',
      type: 'fill',
      source: 'world',
      'source-layer': 'water',
      maxzoom: 9,
      paint: { 'fill-color': p.sea },
    },
    {
      id: 'world-earth',
      type: 'fill',
      source: 'world',
      'source-layer': 'earth',
      maxzoom: 9,
      paint: { 'fill-color': p.land, 'fill-outline-color': p.coast },
    },
    {
      id: 'region-landcover',
      type: 'fill',
      source: 'region',
      'source-layer': 'landcover',
      filter: ['in', ['get', 'class'], ['literal', ['wood', 'grass', 'farmland', 'wetland']]],
      paint: { 'fill-color': p.green },
    },
    {
      id: 'region-park',
      type: 'fill',
      source: 'region',
      'source-layer': 'park',
      paint: { 'fill-color': p.green },
    },
    {
      id: 'region-water',
      type: 'fill',
      source: 'region',
      'source-layer': 'water',
      paint: { 'fill-color': p.lake },
    },
    {
      id: 'region-coast',
      type: 'line',
      source: 'region',
      'source-layer': 'water',
      paint: { 'line-color': p.coast, 'line-width': 1 },
    },
    {
      id: 'region-waterway',
      type: 'line',
      source: 'region',
      'source-layer': 'waterway',
      paint: { 'line-color': p.lake, 'line-width': step(0.5, 1, 1.5) },
    },
    {
      id: 'region-boundary',
      type: 'line',
      source: 'region',
      'source-layer': 'boundary',
      filter: ['>=', ['get', 'admin_level'], 2],
      paint: { 'line-color': p.coast, 'line-width': 1, 'line-dasharray': [3, 2] },
    },
    roadLayer('local-casing', MINOR, p.localCasing, step(0, 2.6, 4.5)),
    roadLayer(
      'major-casing',
      MAJOR,
      ['step', ['zoom'], p.mainCasingFar, 10, p.mainCasing],
      step(2.6, 4.5, 7),
    ),
    roadLayer('local-fill', MINOR, p.localFill, step(0, 1.4, 2.6)),
    roadLayer(
      'major-fill',
      MAJOR,
      ['step', ['zoom'], p.mainFillFar, 10, p.mainFill],
      step(1.4, 2.8, 4.5),
    ),
    {
      id: 'region-road-name',
      type: 'symbol',
      source: 'region',
      'source-layer': 'transportation_name',
      minzoom: 13,
      layout: {
        'symbol-placement': 'line',
        'text-field': NAME,
        'text-font': FONT,
        'text-size': 10.5,
      },
      paint: { 'text-color': p.label, ...halo },
    },
    {
      id: 'region-peak',
      type: 'symbol',
      source: 'region',
      'source-layer': 'mountain_peak',
      maxzoom: 11.5,
      layout: { 'text-field': NAME, 'text-font': FONT, 'text-size': 10 },
      paint: { 'text-color': p.peak, ...halo },
    },
    {
      id: 'region-place-village',
      type: 'symbol',
      source: 'region',
      'source-layer': 'place',
      filter: ['in', ['get', 'class'], ['literal', ['village', 'suburb', 'hamlet']]],
      layout: { 'text-field': NAME, 'text-font': FONT, 'text-size': 11 },
      paint: { 'text-color': p.label, ...halo },
    },
    {
      id: 'region-place-town',
      type: 'symbol',
      source: 'region',
      'source-layer': 'place',
      filter: ['in', ['get', 'class'], ['literal', ['city', 'town']]],
      layout: {
        'text-field': NAME,
        'text-font': FONT,
        'text-size': 12.5,
        'text-letter-spacing': 0.01,
      },
      paint: { 'text-color': p.labelBold, ...halo },
    },
    {
      id: 'world-places',
      type: 'symbol',
      source: 'world',
      'source-layer': 'places',
      maxzoom: 9,
      layout: { 'text-field': ['get', 'name'], 'text-font': FONT, 'text-size': 12.5 },
      paint: { 'text-color': p.labelBold, ...halo },
    },
  ] as Layer[];
}

function roadLayer(id: string, classes: readonly string[], color: unknown, width: unknown): Layer {
  return {
    id: `region-road-${id}`,
    type: 'line',
    source: 'region',
    'source-layer': 'transportation',
    filter: ['in', ['get', 'class'], ['literal', [...classes]]],
    layout: { 'line-cap': 'round', 'line-join': 'round' },
    paint: { 'line-color': color, 'line-width': width },
  } as Layer;
}

/** The premium style in `mode`, its `region` source reading `regionUrl` (a `pmtiles://` url). */
export function premiumMapStyle(mode: MapMode, regionUrl: string): StyleSpecification {
  return {
    version: base.version,
    name: `critterpass-${mode}`,
    glyphs: base.glyphs,
    sources: { ...base.sources, region: { type: 'vector', url: regionUrl } },
    layers: layers(mode),
  } as StyleSpecification;
}
