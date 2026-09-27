import { CritterStickerElement } from './critter-sticker';

/** Idempotently defines `<critter-sticker>`. Safe to call more than once (e.g. from multiple entry bundles on the same page). */
export function registerCritterSticker(): void {
  if (!customElements.get(CritterStickerElement.tagName)) {
    customElements.define(CritterStickerElement.tagName, CritterStickerElement);
  }
}
