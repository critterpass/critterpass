/**
 * Mapillary street-level photos (https://www.mapillary.com/developer/api-documentation), the last
 * resort for a place with no photo of its own and no labelled stock photo. The images are
 * CC BY-SA 4.0: the credit names the contributor and Mapillary, and the asset links to the image
 * on mapillary.com. Most of what is near a place is a dashcam's view of the road, so geometry
 * picks the few images that can show the place at all (this file) and a vision check keeps only
 * the ones that do (photo-check.ts).
 *
 * Geometry: not a panorama, taken 6 to 30 m from the place, the camera pointing within 30° of it,
 * and never looking at the other side of the street when the side can be told. The newest
 * sequences come first, one image per sequence, three per place.
 */
import { distanceM } from './place-match';
import { getJson, type SourceHttp } from './http';
import type { SourceCandidate } from './pexels';

const GRAPH = 'https://graph.mapillary.com/images';
const FIELDS = [
  ...['id', 'captured_at', 'compass_angle', 'computed_compass_angle', 'computed_geometry'],
  ...['geometry', 'is_pano', 'thumb_2048_url', 'thumb_1024_url', 'creator', 'sequence'],
  ...['width', 'height'],
].join(',');
/** Half the side of the box searched around a place: the farthest a kept image may stand. */
const BOX_M = 32;
const MAX_IMAGES = 2000;
const MAX_ASKS = 3;
const M_PER_DEG = 111_320;

export const MIN_DISTANCE_M = 6;
export const MAX_DISTANCE_M = 30;
export const MAX_OFF_AXIS_DEG = 30;
export const CANDIDATES_PER_PLACE = 3;
/** A place this close to the line of travel has no side of the street to speak of. */
const SIDE_MIN_OFFSET_M = 3;
/** A camera within this of the line of travel looks along the road, at neither side. */
const SIDE_MIN_TURN_DEG = 10;
/** Frames of one sequence farther apart than this say nothing about the road between them. */
const MAX_STEP_M = 60;

interface Point {
  type: 'Point';
  coordinates: [number, number];
}

interface GraphImage {
  id: string;
  captured_at?: number;
  compass_angle?: number;
  computed_compass_angle?: number;
  computed_geometry?: Point;
  geometry?: Point;
  is_pano?: boolean;
  thumb_2048_url?: string;
  thumb_1024_url?: string;
  creator?: { username?: string };
  sequence?: string;
  width?: number;
  height?: number;
}

/** One street-level image as the checks read it. */
export interface StreetImage {
  readonly id: string;
  readonly capturedAt: number;
  readonly lat: number;
  readonly lng: number;
  /** Where the camera points, degrees clockwise from north. */
  readonly angle: number;
  readonly pano: boolean;
  readonly sequence: string | null;
  readonly creator: string | null;
  readonly width: number;
  readonly height: number;
  readonly file: string;
  readonly preview: string;
}

export interface StreetCandidate {
  readonly image: StreetImage;
  readonly distanceM: number;
  /** How far the camera points away from the place, in degrees. */
  readonly offAxisDeg: number;
  readonly year: number;
}

interface LatLng {
  readonly lat: number;
  readonly lng: number;
}

/** Bearing from `a` to `b`, degrees clockwise from north. */
export function bearingDeg(a: LatLng, b: LatLng): number {
  const rad = Math.PI / 180;
  const dLng = (b.lng - a.lng) * rad;
  const y = Math.sin(dLng) * Math.cos(b.lat * rad);
  const x =
    Math.cos(a.lat * rad) * Math.sin(b.lat * rad) -
    Math.sin(a.lat * rad) * Math.cos(b.lat * rad) * Math.cos(dLng);
  return (Math.atan2(y, x) / rad + 360) % 360;
}

/** The signed turn from `from` to `to`, in (-180, 180]: positive is to the right. */
function turnDeg(from: number, to: number): number {
  const turn = (((to - from) % 360) + 540) % 360;
  return turn - 180 === -180 ? 180 : turn - 180;
}

function toImage(raw: GraphImage): StreetImage | null {
  const at = raw.computed_geometry ?? raw.geometry;
  const angle = raw.computed_compass_angle ?? raw.compass_angle;
  const file = raw.thumb_2048_url ?? raw.thumb_1024_url;
  if (at === undefined || angle === undefined || file === undefined) return null;
  if (raw.captured_at === undefined || raw.width === undefined || raw.height === undefined) {
    return null;
  }
  return {
    id: raw.id,
    capturedAt: raw.captured_at,
    lat: at.coordinates[1],
    lng: at.coordinates[0],
    angle,
    pano: raw.is_pano === true,
    sequence: raw.sequence ?? null,
    creator: raw.creator?.username ?? null,
    width: raw.width,
    height: raw.height,
    file,
    preview: raw.thumb_1024_url ?? file,
  };
}

/**
 * Every image Mapillary has in the box around `place`. The token is sent, never cached. The
 * search answers with a part of what it has as often as not (11 images, then 233, for one church
 * front), so it is asked again until an answer adds nothing new, three times at most.
 */
export async function streetImagesNear(
  http: SourceHttp,
  token: string,
  place: LatLng,
): Promise<StreetImage[]> {
  const dLat = BOX_M / M_PER_DEG;
  const dLng = BOX_M / (M_PER_DEG * Math.cos((place.lat * Math.PI) / 180));
  const bbox = [place.lng - dLng, place.lat - dLat, place.lng + dLng, place.lat + dLat]
    .map((value) => value.toFixed(6))
    .join(',');
  const found = new Map<string, StreetImage>();
  for (let ask = 0; ask < MAX_ASKS; ask += 1) {
    const url = new URL(GRAPH);
    // Each ask has its own limit, so each has its own place in the day's cache.
    url.search = new URLSearchParams({
      bbox,
      fields: FIELDS,
      limit: String(MAX_IMAGES - ask),
    }).toString();
    const body = await getJson<{ data?: GraphImage[] }>(http, url, {
      headers: { authorization: `OAuth ${token}` },
    });
    const before = found.size;
    for (const raw of body.data ?? []) {
      const image = toImage(raw);
      if (image !== null && !found.has(image.id)) found.set(image.id, image);
    }
    if (ask > 0 && found.size === before) break;
  }
  return [...found.values()];
}

/**
 * The way the camera was travelling when it took `image`, from its neighbours in the sequence, or
 * null when it has none close by.
 */
function travelDeg(image: StreetImage, images: readonly StreetImage[]): number | null {
  if (image.sequence === null) return null;
  const frames = images
    .filter((other) => other.sequence === image.sequence)
    .sort((a, b) => a.capturedAt - b.capturedAt);
  const at = frames.findIndex((frame) => frame.id === image.id);
  const near = (frame: StreetImage | undefined) =>
    frame !== undefined && distanceM(frame, image) <= MAX_STEP_M && distanceM(frame, image) > 0.5;
  const before = frames[at - 1];
  const after = frames[at + 1];
  if (near(before) && near(after) && before !== undefined && after !== undefined) {
    return bearingDeg(before, after);
  }
  if (near(after) && after !== undefined) return bearingDeg(image, after);
  if (near(before) && before !== undefined) return bearingDeg(before, image);
  return null;
}

/**
 * Whether the camera looks at the other side of the street from the place: the place lies clearly
 * to one side of the line of travel and the camera is turned clearly to the other. Unknown travel,
 * a place on the line or a camera looking along the road tell nothing, and are not the wrong side.
 */
export function looksAcrossTheStreet(
  place: LatLng,
  image: StreetImage,
  images: readonly StreetImage[],
): boolean {
  const travel = travelDeg(image, images);
  if (travel === null) return false;
  const toPlace = turnDeg(travel, bearingDeg(image, place));
  const offset = distanceM(image, place) * Math.sin((toPlace * Math.PI) / 180);
  const turned = turnDeg(travel, image.angle);
  if (Math.abs(offset) < SIDE_MIN_OFFSET_M) return false;
  if (Math.abs(turned) < SIDE_MIN_TURN_DEG || Math.abs(turned) > 180 - SIDE_MIN_TURN_DEG) {
    return false;
  }
  return Math.sign(offset) !== Math.sign(turned);
}

/** The images that can show `place`, newest sequence first, one per sequence, at most three. */
export function streetCandidates(
  place: LatLng,
  images: readonly StreetImage[],
  limit = CANDIDATES_PER_PLACE,
): StreetCandidate[] {
  const fitting: StreetCandidate[] = [];
  for (const image of images) {
    if (image.pano) continue;
    const distance = distanceM(image, place);
    if (distance < MIN_DISTANCE_M || distance > MAX_DISTANCE_M) continue;
    const offAxisDeg = Math.abs(turnDeg(image.angle, bearingDeg(image, place)));
    if (offAxisDeg > MAX_OFF_AXIS_DEG) continue;
    if (looksAcrossTheStreet(place, image, images)) continue;
    fitting.push({
      image,
      distanceM: Math.round(distance),
      offAxisDeg: Math.round(offAxisDeg),
      year: new Date(image.capturedAt).getUTCFullYear(),
    });
  }
  // One per sequence: the frame that points at the place most squarely.
  const best = new Map<string, StreetCandidate>();
  for (const candidate of fitting) {
    const key = candidate.image.sequence ?? candidate.image.id;
    const held = best.get(key);
    if (held === undefined || candidate.offAxisDeg < held.offAxisDeg) best.set(key, candidate);
  }
  return [...best.values()]
    .sort((a, b) => b.image.capturedAt - a.image.capturedAt || a.image.id.localeCompare(b.image.id))
    .slice(0, limit);
}

const LICENCE = {
  licence: 'cc-by-sa-4.0',
  licence_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
} as const;
/** The largest file Mapillary serves: 2048 px on the long side. */
const FILE_PX = 2048;

/** The media candidate for a street image: credited to its contributor and Mapillary. */
export function streetCandidate(image: StreetImage): SourceCandidate {
  const scale = Math.min(1, FILE_PX / Math.max(image.width, image.height));
  const author = image.creator ?? 'Mapillary contributor';
  return {
    id: `mapillary-photo-${image.id}`,
    kind: 'photo',
    source: 'mapillary',
    source_id: image.id,
    source_url: `https://www.mapillary.com/app/?pKey=${image.id}`,
    // The link expires within hours: the ingest job asks for the image's current one by its id.
    download_url: image.file,
    preview_url: image.preview,
    title: null,
    author,
    author_url: null,
    ...LICENCE,
    attribution_required: true,
    credit: `${author} · CC BY-SA 4.0 · Mapillary`.slice(0, 300),
    width: Math.round(image.width * scale),
    height: Math.round(image.height * scale),
    duration_ms: null,
  };
}
