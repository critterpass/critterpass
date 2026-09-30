/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import { Redirect, useLocalSearchParams } from 'expo-router';

/**
 * Pushes and inbox items link setup as `/trip/{id}/setup/...`; the screens live at
 * `/{id}/setup/...`. Forwards with the rest of the path and the query intact.
 */
export default function SetupLinkForward() {
  const { tripId, rest, ...query } = useLocalSearchParams<{
    tripId: string;
    rest: string[];
  }>();
  const tail = (Array.isArray(rest) ? rest : [rest]).map(encodeURIComponent).join('/');
  const search = new URLSearchParams(query).toString();
  return (
    <Redirect
      href={`/${encodeURIComponent(tripId)}/setup/${tail}${search === '' ? '' : `?${search}`}`}
    />
  );
}
