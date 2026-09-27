import { t } from '@lingui/core/macro';

/** "{name}, {form} form" — a discovered critter's default sticker label. */
export function stickerLabel(name: string, formName: string): string {
  return t({
    id: 'sticker.a11y.formLabel',
    // eslint-disable-next-line @typescript-eslint/no-base-to-string, @typescript-eslint/restrict-template-expressions -- Lingui macro reads this object at compile time, never stringified at runtime
    message: `${{ name }}, ${{ form: formName }} form`,
  });
}

/** "{name}, {pose}" — a guide mid-pose (wave, cheer, ...), read out over the static form label. */
export function stickerPoseLabel(name: string, poseName: string): string {
  return t({
    id: 'sticker.a11y.poseLabel',
    // eslint-disable-next-line @typescript-eslint/no-base-to-string, @typescript-eslint/restrict-template-expressions -- Lingui macro reads this object at compile time, never stringified at runtime
    message: `${{ name }}, ${{ pose: poseName }}`,
  });
}

/** "Undiscovered local, found by being in {city}" — the locked silhouette's label. */
export function lockedStickerLabel(city: string): string {
  return t({
    id: 'sticker.a11y.lockedLabel',
    // eslint-disable-next-line @typescript-eslint/no-base-to-string, @typescript-eslint/restrict-template-expressions -- Lingui macro reads this object at compile time, never stringified at runtime
    message: `Undiscovered local, found by being in ${{ city }}`,
  });
}
