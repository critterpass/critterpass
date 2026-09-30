/**
 * Plain ride-app links, the truthful fallback while Grab Farefeed is switched off or unavailable,
 * and the only path where Grab does not run: Grab opens on its booking screen with the drop-off
 * filled in, Uber through its documented universal link (`m.uber.com/ul`), Gojek on its home screen.
 * Each has a web or store fallback for a phone without the app. None of them books anything.
 */
import type { RideApp, RideLink } from '@cp/domain';

import { gojekLink } from '../gojek/deeplink';

export interface RideLinkTarget {
  readonly lat: number;
  readonly lng: number;
  readonly name: string;
}

export const GRAB_FALLBACK_URL = 'https://www.grab.com/download/';

function grabLink(to: RideLinkTarget): RideLink {
  const params = new URLSearchParams({
    screenType: 'BOOKING',
    dropOffLatitude: to.lat.toFixed(6),
    dropOffLongitude: to.lng.toFixed(6),
    dropOffAddress: to.name.slice(0, 120),
  });
  return {
    provider: 'grab',
    app_url: `grab://open?${params.toString()}`,
    fallback_url: GRAB_FALLBACK_URL,
  };
}

function uberLink(to: RideLinkTarget): RideLink {
  const params = new URLSearchParams({
    action: 'setPickup',
    pickup: 'my_location',
    'dropoff[latitude]': to.lat.toFixed(6),
    'dropoff[longitude]': to.lng.toFixed(6),
    'dropoff[nickname]': to.name.slice(0, 120),
  });
  const url = `https://m.uber.com/ul/?${params.toString()}`;
  return { provider: 'uber', app_url: url, fallback_url: url };
}

export function rideAppLink(app: RideApp, to: RideLinkTarget): RideLink {
  if (app === 'grab') return grabLink(to);
  if (app === 'uber') return uberLink(to);
  return { provider: 'gojek', ...gojekLink() };
}
