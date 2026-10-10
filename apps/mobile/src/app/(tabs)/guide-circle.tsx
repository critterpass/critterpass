import { Redirect } from 'expo-router';

/**
 * The premium tab bar's guide circle is a tab trigger, so it needs a route; selecting it is
 * refused and its press opens the guide sheet. Reached any other way (a stale link), it goes Home.
 */
export default function GuideCircleRoute() {
  return <Redirect href="/" />;
}
