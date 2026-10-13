import { Redirect } from 'expo-router';

/** The profile lives in one place: the Pass tab. */
export default function ProfileRoute() {
  // eslint-disable-next-line lingui/no-unlocalized-strings -- a route path, not copy.
  return <Redirect href="/pass" />;
}
