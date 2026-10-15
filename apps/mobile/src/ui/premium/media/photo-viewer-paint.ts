/* eslint-disable critterpass/no-literal-style, lingui/no-unlocalized-strings -- colours over pictures, which the premium tokens do not carry yet */
/** Black under the pictures, white type on them, and the foot's fade (dark enough on any photo). */
export const PHOTO_VIEWER_PAINT = {
  ground: '#000000',
  onPhoto: '#ffffff',
  onPhotoMuted: 'rgba(255,255,255,.75)',
  footFade: 'linear-gradient(180deg, rgba(0,0,0,0) 0%, rgba(0,0,0,.72) 38%)',
} as const;
