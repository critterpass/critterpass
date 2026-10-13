/* eslint-disable critterpass/no-literal-style, lingui/no-unlocalized-strings -- colours and gradients the premium tokens do not carry yet */
/** The photo viewer's paint over pictures, which the premium tokens do not carry yet. */
export const VIEWER_PAINT = {
  /** Black under the viewer, so the cover's fade never shows the ground. */
  ground: '#000000',
  /** The bar's fade over the photo, dark enough for white type on any picture. */
  barFade: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.72) 38%)',
  onPhoto: '#ffffff',
  onPhotoMuted: 'rgba(255,255,255,.75)',
} as const;
