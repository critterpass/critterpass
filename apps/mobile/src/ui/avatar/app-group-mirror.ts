/**
 * Mirrors the user's current avatar into the App Group (`assets/avatars/…`) as a PNG, so the
 * notification service extension can draw it without the app running (communication
 * notifications, 5b-1). Stickers are rendered at 40 pt @3x with the same renderer as `<Sticker>`;
 * a photo avatar is written from its uploaded PNG bytes.
 */
import type { SkiaEngine } from '@cp/critter-art/skia';

import { renderStickerPng } from '../sticker/export-png';

/** The App Group writer (cp-app-group `writeImage`): key under `assets/`, PNG as base64. */
export type AppGroupImageWriter = (key: string, pngBase64: string) => void;

// eslint-disable-next-line lingui/no-unlocalized-strings -- an App Group file key, never copy.
export const SELF_AVATAR_KEY = 'avatars/me@3x';

const MIRROR_PT = 40;
const MIRROR_SCALE = 3;

function base64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString('base64');
}

export function mirrorStickerAvatar(
  kind: string,
  engine: SkiaEngine,
  write: AppGroupImageWriter,
): void {
  const png = renderStickerPng(
    { kind, seed: 7, closedEyes: false },
    MIRROR_PT,
    MIRROR_SCALE,
    engine,
  );
  write(SELF_AVATAR_KEY, base64(png));
}

export function mirrorPhotoAvatar(png: Uint8Array, write: AppGroupImageWriter): void {
  write(SELF_AVATAR_KEY, base64(png));
}
