import { t } from '@lingui/core/macro';

/**
 * Spoken labels for critter and guide art (docs/design-system.md §5 "Doodle labels"). Every sticker,
 * slot and guide pose reads out through these so VoiceOver and TalkBack hear the same phrasing.
 */

/** "{name}, {form} form": a discovered critter in one of its forms. */
export function critterLabel(name: string, formName: string): string {
  return t({
    id: 'sticker.a11y.formLabel',
    // eslint-disable-next-line @typescript-eslint/no-base-to-string, @typescript-eslint/restrict-template-expressions -- Lingui macro reads this object at compile time, never stringified at runtime
    message: `${{ name }}, ${{ form: formName }} form`,
  });
}

/** "{name}, {pose}": a guide mid-pose (wave, cheer, ...). */
export function guideLabel(name: string, poseName: string): string {
  return t({
    id: 'sticker.a11y.poseLabel',
    // eslint-disable-next-line @typescript-eslint/no-base-to-string, @typescript-eslint/restrict-template-expressions -- Lingui macro reads this object at compile time, never stringified at runtime
    message: `${{ name }}, ${{ pose: poseName }}`,
  });
}

/** "Undiscovered local, found by being in {city}": a locked critter silhouette. */
export function lockedCritterLabel(city: string): string {
  return t({
    id: 'sticker.a11y.lockedLabel',
    // eslint-disable-next-line @typescript-eslint/no-base-to-string, @typescript-eslint/restrict-template-expressions -- Lingui macro reads this object at compile time, never stringified at runtime
    message: `Undiscovered local, found by being in ${{ city }}`,
  });
}

/** Props that hide purely decorative art (flourishes, textures, MRZ lines) from assistive tech. */
export const DECORATIVE = {
  accessible: false,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants',
} as const;
