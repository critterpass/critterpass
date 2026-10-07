/**
 * The menu reading contract. The model answers, per OCR line id, what the dish is and whether it
 * clashes with what each consenting crew member eats; it supplies no numbers. Code keeps only
 * dishes on lines the device sent and members the server named, strips any digits or currency the
 * model wrote into its text, and reads each price from the menu's own text (./price.ts).
 */
import type Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';

import { parseMenuPrice, type MenuLine, type MenuPrice } from './price';

/** A crew member whose dietary flags may be checked: only members who consented reach here. */
export interface MenuCrewMember {
  readonly first_name: string;
  readonly flags: readonly string[];
}

const flagSchema = z.object({
  member: z.string(),
  verdict: z.enum(['ok', 'clash']),
  reason: z.string(),
});
const itemSchema = z.object({
  ocr_line_id: z.string(),
  translation: z.string(),
  description: z.string(),
  spice: z.number().int().min(0).max(3).nullable(),
  flags: z.array(flagSchema),
});
export const menuReplySchema = z.object({
  items: z.array(itemSchema),
  suggestion: z.string().nullable(),
});
export type MenuReply = z.infer<typeof menuReplySchema>;

export const MENU_FORMAT: Anthropic.Messages.JSONOutputFormat = {
  type: 'json_schema',
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['items', 'suggestion'],
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['ocr_line_id', 'translation', 'description', 'spice', 'flags'],
          properties: {
            ocr_line_id: { type: 'string' },
            translation: { type: 'string' },
            description: { type: 'string' },
            spice: { type: ['integer', 'null'] },
            flags: {
              type: 'array',
              items: {
                type: 'object',
                additionalProperties: false,
                required: ['member', 'verdict', 'reason'],
                properties: {
                  member: { type: 'string' },
                  verdict: { type: 'string', enum: ['ok', 'clash'] },
                  reason: { type: 'string' },
                },
              },
            },
          },
        },
      },
      suggestion: { type: ['string', 'null'] },
    },
  },
};

export interface MenuItem {
  readonly ocr_line_id: string;
  readonly translation: string;
  readonly description: string;
  readonly spice: number | null;
  readonly flags: readonly {
    readonly member: string;
    readonly verdict: 'ok' | 'clash';
    readonly reason: string;
  }[];
  readonly price: MenuPrice | null;
}

export interface ParsedMenu {
  readonly status: 'ok' | 'no_dishes' | 'failed';
  readonly items: readonly MenuItem[];
  readonly suggestion: string | null;
}

const CURRENCY_WORDS =
  /(?:rp\.?|rm|us\$|s\$|[$¥€£฿₫₩]|\b(?:vnd|idr|thb|jpy|krw|sgd|myr|usd|eur|gbp)\b|円|บาท)/giu;

/** Model prose without numbers: digits and currency marks go, and the gaps they leave close up. */
export function stripNumbers(text: string): string {
  return text
    .replace(/[\d\uFF10-\uFF19]+(?:[.,][\d\uFF10-\uFF19]+)*\s*(?:(?:k|đ)(?![\p{L}\d]))?/giu, ' ')
    .replace(CURRENCY_WORDS, ' ')
    .replace(/\s+([,.;:!?])/gu, '$1')
    .replace(/\(\s+/gu, '(')
    .replace(/\s+\)/gu, ')')
    .replace(/\(\)/gu, ' ')
    .replace(/\s{2,}/gu, ' ')
    .trim();
}

export interface ValidateMenuOptions {
  readonly lines: readonly MenuLine[];
  readonly crew: readonly MenuCrewMember[];
  readonly currencyHint?: string;
}

export function validateMenuReply(reply: MenuReply, options: ValidateMenuOptions): ParsedMenu {
  const known = new Set(options.lines.map((line) => line.id));
  // A flag is shown only for a member the server named, who has flags to check.
  const members = new Map(
    options.crew
      .filter((member) => member.flags.length > 0)
      .map((member) => [member.first_name.toLowerCase(), member.first_name]),
  );
  const seen = new Set<string>();
  const items: MenuItem[] = [];
  for (const item of reply.items) {
    if (!known.has(item.ocr_line_id) || seen.has(item.ocr_line_id)) continue;
    const translation = stripNumbers(item.translation);
    if (translation === '') continue;
    seen.add(item.ocr_line_id);
    items.push({
      ocr_line_id: item.ocr_line_id,
      translation,
      description: stripNumbers(item.description),
      spice: item.spice,
      flags: item.flags.flatMap((flag) => {
        const member = members.get(flag.member.trim().toLowerCase());
        return member === undefined
          ? []
          : [{ member, verdict: flag.verdict, reason: stripNumbers(flag.reason) }];
      }),
      price: parseMenuPrice(options.lines, item.ocr_line_id, options.currencyHint),
    });
  }
  const suggestion = reply.suggestion === null ? '' : stripNumbers(reply.suggestion);
  return {
    status: items.length === 0 ? 'no_dishes' : 'ok',
    items,
    suggestion: suggestion === '' ? null : suggestion,
  };
}
