/**
 * "Take us to …" in the language drivers speak at the destination, around the drop-off's name and
 * address in the local script (from the place data). Where we have no template the card shows the
 * local name and address alone, which a driver can still read.
 */
/* eslint-disable lingui/no-unlocalized-strings -- phrases in the destination's language, shown to drivers. */
import type { MessageDescriptor } from '@lingui/core';
import { msg } from '@lingui/core/macro';

import type { Place } from './model';

interface Template {
  readonly lang: string;
  readonly phrase: (place: string) => string;
}

const BY_COUNTRY: Readonly<Record<string, Template>> = {
  id: { lang: 'id', phrase: (place) => `Tolong antar kami ke ${place}.` },
  indonesia: { lang: 'id', phrase: (place) => `Tolong antar kami ke ${place}.` },
  my: { lang: 'ms', phrase: (place) => `Tolong hantar kami ke ${place}.` },
  malaysia: { lang: 'ms', phrase: (place) => `Tolong hantar kami ke ${place}.` },
  th: { lang: 'th', phrase: (place) => `กรุณาไปส่งที่ ${place}` },
  thailand: { lang: 'th', phrase: (place) => `กรุณาไปส่งที่ ${place}` },
  vn: { lang: 'vi', phrase: (place) => `Cho chúng tôi đến ${place}.` },
  vietnam: { lang: 'vi', phrase: (place) => `Cho chúng tôi đến ${place}.` },
  jp: { lang: 'ja', phrase: (place) => `${place}までお願いします。` },
  japan: { lang: 'ja', phrase: (place) => `${place}までお願いします。` },
  kr: { lang: 'ko', phrase: (place) => `${place}까지 가 주세요.` },
  'south korea': { lang: 'ko', phrase: (place) => `${place}까지 가 주세요.` },
  mx: { lang: 'es', phrase: (place) => `Llévenos a ${place}, por favor.` },
  mexico: { lang: 'es', phrase: (place) => `Llévenos a ${place}, por favor.` },
  pe: { lang: 'es', phrase: (place) => `Llévenos a ${place}, por favor.` },
  peru: { lang: 'es', phrase: (place) => `Llévenos a ${place}, por favor.` },
  pt: { lang: 'pt', phrase: (place) => `Leve-nos a ${place}, por favor.` },
  portugal: { lang: 'pt', phrase: (place) => `Leve-nos a ${place}, por favor.` },
};

export interface DriverPhrase {
  readonly phrase: string;
  readonly lang: string;
  /** The place in the reader's script, for the gloss. */
  readonly placeForGloss: string;
}

function joined(name: string, address: string | null): string {
  return address === null || address.trim() === '' ? name : `${name}, ${address}`;
}

export function driverPhrase(place: Place, country: string | null): DriverPhrase {
  const local = joined(place.nameLocal ?? place.name, place.address);
  const template = country === null ? undefined : BY_COUNTRY[country.trim().toLowerCase()];
  return {
    phrase: template ? template.phrase(local) : local,
    lang: template?.lang ?? 'en',
    placeForGloss: joined(place.name, place.address),
  };
}

/** The gloss under the driver phrase, in the reader's language, naming the same place. */
export function glossMessage(place: string): MessageDescriptor {
  return msg({ id: 'suppliers.around.gloss', message: `Please take us to ${place}.` });
}
