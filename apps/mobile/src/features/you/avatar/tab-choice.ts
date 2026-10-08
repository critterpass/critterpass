/**
 * What opening a tab of the avatar picker picks. Critters and photos are picked inside their tab;
 * initials have nothing to pick, so opening INITIALS is the choice for anyone wearing something
 * else, and leaving the tab without saving drops it again.
 */
import type { AvatarTab } from './avatar-view';

interface Kinded {
  readonly kind: string;
}

const INITIALS = { kind: 'initials' } as const;

export function choiceOnTab<C extends Kinded>(
  tab: AvatarTab,
  currentKind: string,
  choice: C | null,
): C | typeof INITIALS | null {
  if (tab === 'initials') return currentKind === 'initials' ? null : INITIALS;
  return choice?.kind === 'initials' ? null : choice;
}
