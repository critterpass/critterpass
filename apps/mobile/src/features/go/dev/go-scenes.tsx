/**
 * Lab scenes for the GO preview, one per state, from Dragon Bridge to the Marble Mountains in Đà
 * Nẵng: the routed drive with Grab's fare, the routed walk, no location, no signal, the router's
 * straight-line fallback, and a place where Grab does not run. Every handler is a no-op.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import type { RideQuoteResult } from '@cp/domain';
import { useState, type ReactNode } from 'react';

import { GoPreviewView } from '../go-preview-view';
import type { GoMode } from '../maps-handoff';
import { previewState, type PreviewInput, type RoutePreview } from '../preview-model';

const noop = () => undefined;

const DRAGON_BRIDGE = { lat: 16.0611, lng: 108.2272 };
const MARBLE = { lat: 16.0039, lng: 108.2633, name: 'Marble Mountains' };

/** The recorded Đà Nẵng drive (Valhalla fixture), simplified and encoded like the api answers. */
const DRIVE_SHAPE =
  'u|_aB_cqsSy@kk@bl@}LnC]xF{Ate@wJfs@aYjl@qVzj@{TlYwLtr@mXdYmLjDcAlCe@`NUPiKrAoHBcAYgAsAqBy@r@Tt@';

const ROUTED: RoutePreview = {
  walk: { minutes: 104, meters: 8120, shape: DRIVE_SHAPE, approx: false, source: 'valhalla' },
  drive: { minutes: 21, meters: 8476, shape: DRIVE_SHAPE, approx: false, source: 'valhalla' },
};

const GRAB: RideQuoteResult = {
  copy_key: 'suppliers.rides.grab_estimate',
  estimate: {
    quote_id: '0199a1c2-7b3e-7c10-9a55-3f1f6e2d4b10',
    provider: 'grab',
    service: 'GrabCar',
    eta_min: 4,
    fare_low_minor: 95000,
    fare_high_minor: 120000,
    currency: 'VND',
    surge: 'none',
    fetched_at: '2026-10-04T02:30:00Z',
    deep_link: 'grab://open',
  },
  fare_estimate: null,
  links: [],
  phrase_card: {
    poi_id: '0199a1c2-7b3e-7c10-9a55-3f1f6e2d4b11',
    name: 'Marble Mountains',
    name_local: 'Ngũ Hành Sơn',
    address: null,
  },
};

const BASE: PreviewInput = {
  place: MARBLE,
  locate: { kind: 'here', at: DRAGON_BRIDGE },
  route: { kind: 'ready', preview: ROUTED },
  online: true,
  mode: 'drive',
  ride: { kind: 'ready', quote: GRAB },
};

function Scene({ input }: { readonly input: Partial<PreviewInput> }) {
  const [mode, setMode] = useState<GoMode>(input.mode ?? BASE.mode);
  return (
    <GoPreviewView
      place={MARBLE}
      destinationSlug="da-nang"
      state={previewState({ ...BASE, ...input, mode })}
      mode={mode}
      onMode={setMode}
      mapsApp="google"
      onStart={noop}
      onRide={noop}
    />
  );
}

export const GO_SCENES: Readonly<Record<string, () => ReactNode>> = {
  'go-routed': () => <Scene input={{}} />,
  'go-routed-walk': () => <Scene input={{ mode: 'walk' }} />,
  'go-no-location': () => <Scene input={{ locate: { kind: 'denied' }, ride: { kind: 'none' } }} />,
  'go-offline': () => <Scene input={{ online: false, ride: { kind: 'none' } }} />,
  'go-straight': () => <Scene input={{ route: { kind: 'error' } }} />,
  'go-no-grab': () => <Scene input={{ ride: { kind: 'none' } }} />,
};

export const GO_SCENE_NAMES: readonly string[] = Object.keys(GO_SCENES);
