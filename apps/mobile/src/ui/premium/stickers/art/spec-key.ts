import type { Palette, RenderSpec } from '@cp/critter-art';

function paletteKey(palette: Palette): string {
  const { f, dk, bl, accent, leaf, beak2, stripe, eye, pupil, ink } = palette;
  return [f, dk, bl, accent, leaf, beak2, stripe, eye, pupil, ink].map((v) => v ?? '').join(',');
}

function formKey(form: RenderSpec['form']): string {
  if (!form) return '-';
  return `${form.rarity}:${paletteKey(form.palette)}:${form.pose ?? ''}:${form.edge}`;
}

/**
 * A stable string key for the sticker cache: every field that changes a spec's pixels, plus the
 * render bucket, device scale and `artVersion` (bumped whenever the bake pipeline's source or
 * content forms change — see `@cp/critter-bake`'s `computeArtVersion`) so a cached image never
 * outlives the art it was drawn from.
 */
export function specKey(
  spec: RenderSpec,
  bucketPt: number,
  scale: number,
  closedEyes: boolean,
  artVersion: string,
): string {
  const parts = [
    spec.kind,
    formKey(spec.form),
    spec.pose ?? '',
    spec.variant ?? 'color',
    spec.maskColor ?? '',
    spec.sticker ? `${spec.sticker.color}:${spec.sticker.w ?? ''}` : '-',
    spec.blend ?? '',
    String(spec.seed),
    closedEyes ? '1' : '0',
    spec.seedMode ?? '',
    String(bucketPt),
    String(scale),
    artVersion,
  ];
  return parts.join('|');
}
