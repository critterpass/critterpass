import { Redirect, useLocalSearchParams } from 'expo-router';

// A route path, never copy.
// eslint-disable-next-line lingui/no-unlocalized-strings -- a route path.
const HOME_TAB = '/(tabs)';

/**
 * `/` opens the HOME tab. Both `(tabs)/index` and the dev group's `(dev)/index` would otherwise
 * match `/`, and the router picks the dev list in development builds; this root route settles it
 * and forwards any params (`?crewId=` from the invite hand-off).
 */
export default function RootIndex() {
  const params = useLocalSearchParams<Record<string, string>>();
  return <Redirect href={{ pathname: HOME_TAB, params }} />;
}
