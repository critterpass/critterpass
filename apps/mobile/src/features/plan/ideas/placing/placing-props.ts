import type { StepStatus } from './progress';
import type { DoodleName } from '@/ui/icons/generated';

export interface PlacingLine {
  readonly key: string;
  readonly text: string;
  readonly status: StepStatus;
}

export interface PlacingViewProps {
  readonly title: string;
  readonly pins: readonly MapPin[];
  readonly lines: readonly PlacingLine[];
  readonly foot: string;
  /** A finished run with nothing to review, or a failed one: what happened and a way on. */
  readonly outcome: { readonly action: string; readonly onAction: () => void } | null;
  readonly onLeave: () => void;
}

export const MAP_HEIGHT = 340;

export const PIN = 28;

const PAD = 28;

const MAX_PINS = 8;

export interface MapPin {
  readonly id: string;
  readonly lat: number;
  readonly lng: number;
  readonly icon: DoodleName;
  /** Placed: its number and its day's colour. */
  readonly stop: { readonly number: number; readonly color: string } | null;
}

/** Pins spread over the panel's width and height, north up. */
export function pinSpots(
  pins: readonly MapPin[],
  width: number,
): { readonly pin: MapPin; readonly x: number; readonly y: number }[] {
  const shown = pins.slice(0, MAX_PINS);
  const lats = shown.map((pin) => pin.lat);
  const lngs = shown.map((pin) => pin.lng);
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)];
  const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)];
  const spanX = Math.max(maxLng - minLng, 1e-6);
  const spanY = Math.max(maxLat - minLat, 1e-6);
  const innerW = Math.max(width - 2 * PAD - PIN, 1);
  const innerH = MAP_HEIGHT - 2 * PAD - PIN;
  return shown.map((pin) => ({
    pin,
    x: PAD + ((pin.lng - minLng) / spanX) * innerW,
    y: PAD + ((maxLat - pin.lat) / spanY) * innerH,
  }));
}
