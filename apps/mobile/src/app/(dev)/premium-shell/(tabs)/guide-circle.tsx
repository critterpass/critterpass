import { Redirect } from 'expo-router';

/** The guide circle's trigger route: selecting it is refused, so this only answers stray links. */
export default function GuideCircleDemoRoute() {
  return <Redirect href="/(dev)/premium-shell/legend" />;
}
