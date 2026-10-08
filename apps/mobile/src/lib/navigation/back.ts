/**
 * Going back from a screen that may have nothing under it.
 *
 * A link, a push tap or a restored launch can open a pushed screen or a sheet route as the only
 * screen in the stack; a bare `router.back()` then does nothing. `goBackOr(fallback)` goes back one
 * screen when there is one and otherwise replaces this screen with `fallback` (Home by default).
 *
 * Use it for every back, close and "done" control. `BackEyebrow`, `BackButton`, `Sheet` and
 * `RiseModal` already do it by default, so pass `fallback` to them (the screen's parent, e.g. the
 * trip or Settings) instead of writing `canGoBack() ? back() : replace(...)` by hand.
 */
import { router, type Href } from 'expo-router';

/** Where back lands when nothing is under the screen and the caller names no parent: Home. */
export const HOME_FALLBACK: Href = '/';

/** True when there is a screen to go back to; false outside a navigator (tests, the gallery). */
export function canGoBack(): boolean {
  try {
    return router.canGoBack();
  } catch {
    return false;
  }
}

/** True only when the navigator says nothing is under this screen; with no navigator to ask, false. */
function nothingUnder(): boolean {
  try {
    return !router.canGoBack();
  } catch {
    return false;
  }
}

/** Back one screen, or `fallback` in place of this screen when there is nothing to go back to. */
export function goBackOr(fallback: Href = HOME_FALLBACK): void {
  if (nothingUnder()) router.replace(fallback);
  else router.back();
}
