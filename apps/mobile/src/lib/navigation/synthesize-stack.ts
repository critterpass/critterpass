import type { Href } from 'expo-router';
import { router } from 'expo-router';

import { PARENTS } from './parents';
import type { ScreenId, ScreenParams } from './screen-registry';
import { hrefFor } from './screen-registry';

/** The stack's root: Home (3b-2). Every chain of parents ends here. */
export const HOME_SCREEN: ScreenId = '3b-2';

/** Design ids from `screenId` up to Home, root first (`['3b-2', '3c-2', …, '3c-9']`). */
export function parentChain(
  screenId: ScreenId,
  parents: Readonly<Record<string, string>> = PARENTS,
): ScreenId[] {
  const chain: ScreenId[] = [];
  const seen = new Set<ScreenId>();
  let current: ScreenId | undefined = screenId;
  while (current !== undefined && !seen.has(current)) {
    seen.add(current);
    chain.unshift(current);
    if (current === HOME_SCREEN) break;
    current = parents[current];
  }
  return chain;
}

/**
 * The back stack for a screen entered cold (deep link, push, widget, Live Activity): its parents up
 * to Home as hrefs, root first, skipping screens no area has registered yet. `params` (a trip id, a
 * place id) are passed to every screen's href builder.
 */
export function synthesizeStack(screenId: ScreenId, params: ScreenParams = {}): Href[] {
  return parentChain(screenId).flatMap((id) => {
    const href = hrefFor(id, params);
    return href === undefined ? [] : [href];
  });
}

/**
 * Opens `screenId` with its synthesized back stack: the root replaces whatever is showing, the
 * rest are pushed, so back walks the designed parents. Returns `false` when the screen itself is
 * unregistered (callers fall back to safe home).
 */
export function openWithBackStack(screenId: ScreenId, params: ScreenParams = {}): boolean {
  if (hrefFor(screenId, params) === undefined) return false;
  const [root, ...rest] = synthesizeStack(screenId, params);
  if (root === undefined) return false;
  router.replace(root);
  for (const href of rest) router.push(href);
  return true;
}
