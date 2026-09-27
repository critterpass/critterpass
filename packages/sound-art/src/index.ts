export { SAMPLE_RATE } from './core/signal';
export { hashPcm } from './core/hash';
export { measureLoopSeam, type LoopSeamReport } from './core/mixer';

export { buildSfxRegistry, SFX_TOKEN_IDS, type SfxCueSpec, type SfxTokenId } from './cues/registry';
export { renderNotify, NOTIFY_MOTIFS } from './cues/notify';

export { buildThemeRegistry, GUIDE_IDS, THEMES, type GuideId } from './music/registry';
export { renderTheme, type RenderedTheme, type ThemeSpec } from './music/render-theme';

export { integratedLufs } from './loudness/lufs';
export { truePeakDb } from './loudness/peak';
