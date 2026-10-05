/**
 * Search joins the app (imported from the planning register): 7d-1 opens the scoped field and 7d-3
 * add from a link. Both are new ids with no earlier screen to replace, so only section 7 screens
 * (behind `planning.redesign`) link to them.
 */
import { registerScreens } from '@/lib/navigation/screen-registry';

import { scopeOf, searchRoutes } from './routes';

registerScreens({
  '7d-1': (params) =>
    searchRoutes.search(params['tripId'] ?? '', {
      scope: scopeOf(params['scope']),
      dayId: params['dayId'],
      poiId: params['poiId'],
      near: params['near'],
      q: params['q'],
    }),
  '7d-3': (params) =>
    searchRoutes.link(
      params['tripId'] ?? '',
      params['url'] !== undefined
        ? { url: params['url'] }
        : params['screenshot'] === '1'
          ? { screenshot: true }
          : { paste: true },
    ),
});
