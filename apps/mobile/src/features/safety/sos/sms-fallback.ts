/**
 * No data, no SOS: the phone's own message composer, prefilled to the crewmates whose numbers the
 * crew can see and with a maps link to where the sender is. The person sends it themselves.
 */
/* eslint-disable lingui/no-unlocalized-strings -- URL schemes and wire values, never copy. */
export interface SmsDraft {
  readonly numbers: readonly string[];
  readonly body: string;
}

const dialable = (phone: string): string => phone.replace(/[^\d+]/gu, '');

export function mapsLink(at: { readonly lat: number; readonly lng: number } | null): string | null {
  return at === null
    ? null
    : `https://maps.google.com/?q=${at.lat.toFixed(5)},${at.lng.toFixed(5)}`;
}

/** iOS takes `sms:/open?addresses=a,b&body=`; Android `sms:a;b?body=`. */
export function smsUrl(draft: SmsDraft, platform: 'ios' | 'android'): string {
  const numbers = draft.numbers.map(dialable).filter((n) => n.length > 0);
  const body = encodeURIComponent(draft.body);
  return platform === 'ios'
    ? `sms:/open?addresses=${numbers.join(',')}&body=${body}`
    : `sms:${numbers.join(';')}?body=${body}`;
}
