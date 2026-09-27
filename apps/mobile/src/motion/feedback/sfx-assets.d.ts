import type { AudioSource } from 'expo-audio';

import type { SoundCueId } from '../impact';

// Type contract for `./sfx-assets`, which Metro (and Jest's haste resolver) resolves per platform
// to `sfx-assets.ios.ts` (`.caf`) or `sfx-assets.android.ts` (`.ogg`). TypeScript has no
// platform-suffix resolution, so this declaration is what `import … from './sfx-assets'` types
// against; both platform files are type-checked against the same shape on their own.
export declare const SFX_ASSET_MODULES: Partial<Record<SoundCueId, AudioSource>>;
