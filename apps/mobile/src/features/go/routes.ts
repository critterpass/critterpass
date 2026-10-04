/** GO's route: the preview for a place, a leave-by's stop, or a trip's next leave-by. */
/* eslint-disable lingui/no-unlocalized-strings -- a route path, never copy. */
import type { Href } from 'expo-router';

import { paramsForTarget, type GoTarget } from './data/go-place';

export function goHref(target: GoTarget): Href {
  return { pathname: '/go', params: paramsForTarget(target) };
}
