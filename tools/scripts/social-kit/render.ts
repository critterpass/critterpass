/**
 * Renders a social kit set into every template it names, per language, with a manifest for
 * posting by hand (file, size and alt text).
 *
 *   pnpm tsx tools/scripts/social-kit/render.ts --set local-of-the-week [--locale en,vi] [--out <dir>]
 *
 * Writes `<out>/<set>/<locale>/<critter>-<template>.png` and `<out>/<set>/<locale>/manifest.json`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

import type { AppLocale } from '@cp/domain';

import {
  socialSetLocales,
  socialSets,
  socialTemplates,
  type SocialSet,
  type SocialTemplate,
} from '../../../packages/content/src/social/index';
import { guideAccent, guideFactsByKey } from '../../../packages/critter-art/src/guides/index';
import { card, sticker, text } from '../../../packages/critter-art/src/share/layout';
import type { CardLayout } from '../../../packages/critter-art/src/share/model';
import { fitText, type MeasureAt } from '../store-kit/fit-text';
import {
  BODY_FONT,
  HEADLINE_FONT,
  measurer,
  MONO_FONT,
  renderOpaquePng,
} from '../store-kit/render';

const INK = '#17142a';
const HANDLE = '@critterpass';
const MARGIN = 80;

export interface SocialCard {
  readonly file: string;
  readonly template: string;
  readonly width: number;
  readonly height: number;
  readonly alt: string;
  readonly layout: CardLayout;
}

export interface Measures {
  readonly headline: MeasureAt;
  readonly body: MeasureAt;
}

/** One critter of a set on one template: eyebrow, sticker, name, place and line, inside the safe band. */
export function socialCard(
  set: SocialSet,
  item: SocialSet['items'][number],
  template: SocialTemplate,
  locale: AppLocale,
  measure: Measures,
): SocialCard {
  const copy = item.copy[locale];
  const eyebrow = set.eyebrow[locale];
  const facts = guideFactsByKey(item.critter);
  if (copy === undefined || eyebrow === undefined) {
    throw new Error(`${set.id} is not written in ${locale}`);
  }
  if (facts === undefined) throw new Error(`${item.critter} is not in the dex`);

  const { width, height, safe } = template;
  const textWidth = width - 2 * MARGIN;
  const top = safe.top + MARGIN;
  const bottom = height - safe.bottom - MARGIN;
  const name = fitText(facts.name.toUpperCase(), measure.headline, {
    maxWidth: textWidth,
    maxLines: 1,
    sizes: [150, 130, 110, 96, 84, 72],
  });
  const line = fitText(copy.line, measure.body, {
    maxWidth: textWidth,
    maxLines: 2,
    sizes: [44, 40, 36],
  });
  const lineHeight = Math.round(line.fontSize * 1.35);
  const lineTop = bottom - 40 - 30 - line.lines.length * lineHeight;
  const placeTop = lineTop - 20 - 44;
  const nameTop = placeTop - 12 - name.fontSize;
  // The sticker takes the room between the eyebrow and the name, centred.
  const stickerTop = top + 70;
  const stickerSize = Math.max(0, Math.min(width - 2 * MARGIN, nameTop - 30 - stickerTop));
  if (stickerSize < 300) throw new Error(`${template.id}: no room for the critter`);

  const mono = { fontFamily: MONO_FONT.family, fontWeight: MONO_FONT.weight, color: INK };
  const layout = card(
    width,
    height,
    [
      text(MARGIN, top, textWidth, eyebrow, { ...mono, fontSize: 30 }, { maxLines: 1 }),
      sticker(
        (width - stickerSize) / 2,
        stickerTop + (nameTop - 30 - stickerTop - stickerSize) / 2,
        stickerSize,
        { kind: item.critter, seed: item.seed },
      ),
      text(
        MARGIN,
        nameTop,
        textWidth,
        facts.name.toUpperCase(),
        {
          fontFamily: HEADLINE_FONT.family,
          fontWeight: HEADLINE_FONT.weight,
          color: INK,
          fontSize: name.fontSize,
        },
        { maxLines: 1, lineHeight: name.fontSize },
      ),
      text(
        MARGIN,
        placeTop,
        textWidth,
        `${facts.city}, ${facts.country}`.toUpperCase(),
        { ...mono, fontSize: 32 },
        { maxLines: 1 },
      ),
      text(
        MARGIN,
        lineTop,
        textWidth,
        copy.line,
        {
          fontFamily: BODY_FONT.family,
          fontWeight: BODY_FONT.weight,
          color: INK,
          fontSize: line.fontSize,
        },
        { maxLines: 2, lineHeight },
      ),
      text(MARGIN, bottom - 40, textWidth, HANDLE, { ...mono, fontSize: 28 }, { maxLines: 1 }),
    ],
    guideAccent(facts.slug, facts.colours),
  );
  return {
    file: `${item.critter}-${template.id}.png`,
    template: template.id,
    width,
    height,
    alt: copy.alt,
    layout,
  };
}

/** Every card of a set in one language: each item on each of the set's templates. */
export function socialBatch(set: SocialSet, locale: AppLocale, measure: Measures): SocialCard[] {
  const templates = socialTemplates();
  return set.items.flatMap((item) =>
    set.templates.map((id) => {
      const template = templates.find((candidate) => candidate.id === id);
      if (template === undefined) throw new Error(`${set.id}: no template ${id}`);
      return socialCard(set, item, template, locale, measure);
    }),
  );
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: {
      set: { type: 'string' },
      locale: { type: 'string' },
      out: { type: 'string', default: fileURLToPath(new URL('./out', import.meta.url)) },
    },
  });
  const sets = socialSets();
  const set = sets.find((candidate) => candidate.id === values.set);
  if (set === undefined) {
    throw new Error(`--set must be one of: ${sets.map((candidate) => candidate.id).join(', ')}`);
  }
  const measure = { headline: measurer(HEADLINE_FONT), body: measurer(BODY_FONT) };
  for (const locale of socialSetLocales(set, values.locale?.split(',').filter(Boolean))) {
    const dir = path.join(values.out, set.id, locale);
    mkdirSync(dir, { recursive: true });
    const cards = socialBatch(set, locale, measure);
    for (const item of cards) {
      writeFileSync(path.join(dir, item.file), await renderOpaquePng(item.layout));
    }
    writeFileSync(
      path.join(dir, 'manifest.json'),
      `${JSON.stringify(
        cards.map(({ layout: _layout, ...entry }) => entry),
        null,
        2,
      )}\n`,
    );
    console.log(`wrote ${String(cards.length)} images to ${dir}`);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
