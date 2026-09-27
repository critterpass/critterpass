/** The six guides (docs/product-decisions.md C5); `lib` can't import the token package's own type. */
export type GuideId = 'tokek' | 'pon' | 'lundi' | 'ajo' | 'sardi' | 'paco';

export interface ActiveGuide {
  readonly guideId: GuideId;
}

/** Brand default guide when no trip or destination gives context. */
export const DEFAULT_GUIDE: ActiveGuide = { guideId: 'tokek' };

type ActiveGuideHook = () => ActiveGuide | null;

let activeGuideHook: ActiveGuideHook = () => null;

/**
 * The trip phase supplies the real hook (guide of the current trip or destination) once at startup,
 * before the shell renders; it must be a stable hook for the app's lifetime (rules of hooks).
 */
export function provideActiveGuide(hook: ActiveGuideHook): void {
  activeGuideHook = hook;
}

/** Guide the FAB and empty states show: the context guide, else Tokek. */
export function useActiveGuide(): ActiveGuide {
  return activeGuideHook() ?? DEFAULT_GUIDE;
}
