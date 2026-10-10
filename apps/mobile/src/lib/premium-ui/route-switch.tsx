import type { ComponentType } from 'react';

import { usePremiumUi } from './premium-switch';

export interface PremiumRouteScreens<P extends object> {
  /** The premium screen (`features/<area>/premium/**`). */
  readonly premium: ComponentType<P>;
  /** The current screen, exactly as the route rendered it before. */
  readonly legacy: ComponentType<P>;
}

/**
 * A route file's default export that renders the premium screen when the premium UI is on and the
 * current one when it is off, on the same URL: deep links, saved navigation, the screen registry and
 * Maestro routes keep working either way. Each side is its own component, so either can read route
 * params and hooks of its own.
 */
export function premiumRoute<P extends object>({
  premium: Premium,
  legacy: Legacy,
}: PremiumRouteScreens<P>): ComponentType<P> {
  function PremiumSwitchRoute(props: P) {
    return usePremiumUi() ? <Premium {...props} /> : <Legacy {...props} />;
  }
  PremiumSwitchRoute.displayName = `premiumRoute(${Premium.displayName ?? Premium.name})`;
  return PremiumSwitchRoute;
}
