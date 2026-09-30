/**
 * Poster and postcard images for a proposal version, drawn by the share renderer
 * (`@cp/critter-art/share`, the same templates the app and web draw) and stored under private R2
 * keys, so only signed reads reach them. Without a media store the version keeps its text and no
 * image key.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { registerFonts, renderCardNode } from '@cp/critter-art/share/node';
import { buildPostcardFront, buildPoster } from '@cp/critter-art/share/templates';

import type { AvatarMediaStore } from '../avatar/media-store';

/** The fonts the share templates name, from `SHARE_FONTS_DIR` (the image copies them there). */
const FONTS = [
  ['Archivo', 'Archivo-W66-800.ttf'],
  ['Geist', 'Geist-400.ttf'],
  ['GeistMono', 'GeistMono-400.ttf'],
  ['Borel', 'Borel-400.ttf'],
] as const;

const REPO_FONTS = fileURLToPath(
  new URL('../../../../../apps/mobile/assets/fonts/', import.meta.url),
);

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

export interface ShareCardInput {
  readonly tripId: string;
  readonly proposalId: string;
  readonly recipientId: string;
  readonly posterTitle: string;
  readonly postcardMessage: string;
  readonly destination: string;
  readonly senderName: string;
  readonly critterSeed: number;
  /** The trip guide's persona; its critter draws the cards (the spark for a guest guide). */
  readonly guide: string;
}

/** Each guide's critter-art kind. */
const GUIDE_KINDS: Readonly<Record<string, string>> = {
  tokek: 'gecko',
  pon: 'tanuki',
  lundi: 'puffin',
  ajo: 'axolotl',
  sardi: 'sardine',
  paco: 'alpaca',
};

export interface ShareCardKeys {
  readonly posterKey: string;
  readonly postcardKey: string;
}

export type ShareCardRenderer = (input: ShareCardInput) => Promise<ShareCardKeys>;

export function shareCardKeys(
  input: Pick<ShareCardInput, 'tripId' | 'proposalId' | 'recipientId'>,
): ShareCardKeys {
  const base = `t/${input.tripId}/proposal/${input.proposalId}/${input.recipientId}`;
  return { posterKey: `${base}/poster.png`, postcardKey: `${base}/postcard.png` };
}

export function createShareCardRenderer(
  store: Pick<AvatarMediaStore, 'put'>,
  fontsDir: string = process.env['SHARE_FONTS_DIR'] ?? REPO_FONTS,
): ShareCardRenderer {
  return async (input) => {
    loadFonts(fontsDir);
    const keys = shareCardKeys(input);
    const poster = await renderCardNode(
      buildPoster({
        title: input.posterTitle,
        entries: [
          {
            kind: GUIDE_KINDS[input.guide] ?? 'spark',
            seed: input.critterSeed,
            label: input.destination,
          },
        ],
      }),
    );
    const postcard = await renderCardNode(
      buildPostcardFront({
        tripName: input.posterTitle,
        city: input.destination,
        message: input.postcardMessage,
        senderName: input.senderName,
        kind: GUIDE_KINDS[input.guide] ?? 'spark',
        seed: input.critterSeed,
      }),
    );
    await store.put(keys.posterKey, poster, 'image/png');
    await store.put(keys.postcardKey, postcard, 'image/png');
    return keys;
  };
}
