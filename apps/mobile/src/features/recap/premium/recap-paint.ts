/* eslint-disable critterpass/no-literal-style, lingui/no-unlocalized-strings -- gradients and colours the premium tokens do not carry yet */
/** The memory and recap scenes' paint the premium tokens do not carry yet. */
export const RECAP_PAINT = {
  /** The year-later photo's wash: dark at the top for the chip, darker at the foot for the words. */
  memoryWash:
    'linear-gradient(180deg, rgba(0,0,0,.45) 0%, rgba(0,0,0,.05) 35%, rgba(0,0,0,.25) 60%, rgba(0,0,0,.85) 100%)',
  /** The dusk the memory stands on while its photo signs or when it has none. */
  dusk: 'linear-gradient(180deg, #3b4a44 0%, #2a2622 60%, #1a1714 100%)',
  onPhoto: '#ffffff',
  onPhotoSoft: 'rgba(255,255,255,.92)',
  glassOnPhoto: 'rgba(255,255,255,.2)',
  /** The share link on a photo: white at .85. */
  shareOnPhoto: 'rgba(255,255,255,.85)',
} as const;
