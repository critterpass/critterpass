import { Redirect, router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect } from 'react';

// A route path, never copy.
// eslint-disable-next-line lingui/no-unlocalized-strings -- a route path.
const HOME_TAB = '/(tabs)';

/**
 * `/` opens the HOME tab. Both `(tabs)/index` and the dev group's `(dev)/index` would otherwise
 * match `/`, and the router picks the dev list in development builds; this root route settles it
 * and forwards any params (`?crewId=` from the invite hand-off, `?notice=`).
 *
 * Opened over a running app (a bare `critterpass://` link, a link that ends up Home) it is pushed
 * as a page of its own over the tabs, and redirecting from there left that page blank: there it
 * goes back to the tabs already under it, on Home.
 */
export default function RootIndex() {
  const params = useLocalSearchParams<Record<string, string>>();
  const navigation = useNavigation();
  const over = navigation.canGoBack();
  useEffect(() => {
    if (!over) return;
    router.dismissTo({ pathname: HOME_TAB, params });
    // Once, as the page arrives: the params are the link's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  if (over) return null;
  return <Redirect href={{ pathname: HOME_TAB, params }} />;
}
