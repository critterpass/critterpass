/**
 * The print-ready postcard: front (the chosen photo, or the guide's art, with the trip's place)
 * and back (the note and who it's from), drawn by the share templates' print variant at 300 dpi,
 * stored under the trip's private media keys and handed to the printer as signed media URLs that
 * stay readable long enough for it to fetch them.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { registerFonts, renderCardNode } from '@cp/critter-art/share/node';
import {
  buildPostcardBackPrint,
  buildPostcardFrontPrint,
  type PostcardProps,
} from '@cp/critter-art/share/templates';
import { signMediaUrl } from '@cp/domain';

import type { AvatarMediaStore } from '../jobs/avatar/media-store';

/** How long the printer can read the print files. */
export const PRINT_ASSET_TTL_SECONDS = 14 * 24 * 60 * 60;

const FONTS = [
  ['Archivo', 'Archivo-W66-800.ttf'],
  ['Geist', 'Geist-400.ttf'],
  ['GeistMono', 'GeistMono-400.ttf'],
  ['Borel', 'Borel-400.ttf'],
] as const;

const REPO_FONTS = fileURLToPath(new URL('../../../../apps/mobile/assets/fonts/', import.meta.url));

/** Each guide's critter-art kind; the spark for a guest guide. */
const GUIDE_KINDS: Readonly<Record<string, string>> = {
  tokek: 'gecko',
  pon: 'tanuki',
  lundi: 'puffin',
  ajo: 'axolotl',
  sardi: 'sardine',
  paco: 'alpaca',
};

let fontsLoaded = false;

function loadFonts(dir: string): void {
  if (fontsLoaded) return;
  fontsLoaded = true;
  registerFonts(
    FONTS.map(([family, file]) => ({
      family,
      bytes: new Uint8Array(readFileSync(join(dir, file))),
    })),
  );
}

export interface PrintCardInput {
  readonly tripId: string;
  readonly postcardId: string;
  readonly tripName: string;
  readonly place: string;
  readonly note: string;
  readonly senderName: string;
  readonly guide: string;
  /** The front photo's display copy, when the postcard has one. */
  readonly photo: { readonly bytes: Uint8Array; readonly contentType: string } | null;
}

export interface PrintAssets {
  readonly frontUrl: string;
  readonly backUrl: string;
}

export type PrintRenderer = (input: PrintCardInput) => Promise<PrintAssets>;

export interface MediaSigning {
  readonly baseUrl: string;
  readonly keyId: string;
  readonly secret: string;
}

function seedOf(id: string): number {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) | 0;
  return Math.abs(hash);
}

export function printAssetKeys(tripId: string, postcardId: string) {
  const base = `t/${tripId}/postcard/${postcardId}`;
  return { front: `${base}/print-front.png`, back: `${base}/print-back.png` };
}

export function createPrintRenderer(
  store: Pick<AvatarMediaStore, 'put'>,
  signing: MediaSigning,
  fontsDir: string = process.env['SHARE_FONTS_DIR'] ?? REPO_FONTS,
  now: () => number = Date.now,
): PrintRenderer {
  return async (input) => {
    loadFonts(fontsDir);
    const props: PostcardProps = {
      tripName: input.tripName,
      city: input.place,
      message: input.note,
      senderName: input.senderName,
      kind: GUIDE_KINDS[input.guide] ?? 'spark',
      seed: seedOf(input.tripId),
      ...(input.photo === null
        ? {}
        : {
            photoUri: `data:${input.photo.contentType};base64,${Buffer.from(input.photo.bytes).toString('base64')}`,
          }),
    };
    const keys = printAssetKeys(input.tripId, input.postcardId);
    await store.put(keys.front, await renderCardNode(buildPostcardFrontPrint(props)), 'image/png');
    await store.put(keys.back, await renderCardNode(buildPostcardBackPrint(props)), 'image/png');
    const expiresAt = Math.floor(now() / 1000) + PRINT_ASSET_TTL_SECONDS;
    const sign = (objectKey: string) =>
      signMediaUrl({ ...signing, objectKey, variant: 'orig', expiresAt });
    return { frontUrl: await sign(keys.front), backUrl: await sign(keys.back) };
  };
}
