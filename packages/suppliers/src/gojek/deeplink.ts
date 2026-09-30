/**
 * Gojek has no public estimate or pre-filled booking link, so "Open Gojek" opens the app (or its
 * download page) and the phrase card carries the drop-off address. No attribution: Gojek is not an
 * affiliate programme of ours.
 */
export const GOJEK_APP_URL = 'gojek://home';
export const GOJEK_FALLBACK_URL = 'https://www.gojek.com/en-id/app';

export function gojekLink(): { app_url: string; fallback_url: string } {
  return { app_url: GOJEK_APP_URL, fallback_url: GOJEK_FALLBACK_URL };
}
