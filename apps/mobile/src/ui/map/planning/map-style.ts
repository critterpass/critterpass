/**
 * The hand-drawn dark style over the destination's tiles: the region file on this phone when
 * there is one, the destination's published region tiles otherwise, the world tiles when the trip
 * has no destination yet.
 */
/* eslint-disable lingui/no-unlocalized-strings -- pmtiles URLs, never copy. */
import type { StyleSpecification } from '@maplibre/maplibre-react-native';

import criterpassDarkStyleJson from '../../../../assets/map-style/critterpass-dark.json';

const darkStyle = criterpassDarkStyleJson as unknown as StyleSpecification;
const WORLD_URL = (darkStyle.sources['world'] as { url: string }).url;

/** The destination's published region tiles, beside the world tiles. */
export function regionTilesUrl(slug: string): string {
  return WORLD_URL.replace(/^pmtiles:\/\//u, '').replace('/world/', `/${slug}/`);
}

export function regionSourceUrl(destinationSlug: string | null, localRegionUri: string | null) {
  if (localRegionUri !== null) return `pmtiles://${localRegionUri}`;
  return destinationSlug === null ? WORLD_URL : `pmtiles://${regionTilesUrl(destinationSlug)}`;
}

export function planningMapStyle(
  destinationSlug: string | null,
  localRegionUri: string | null,
): StyleSpecification {
  return {
    ...darkStyle,
    sources: {
      ...darkStyle.sources,
      region: { type: 'vector', url: regionSourceUrl(destinationSlug, localRegionUri) },
    },
  };
}
