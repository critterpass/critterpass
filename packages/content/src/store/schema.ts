/**
 * Store listings as data (`listing/<locale>.json`), checked against App Store Connect and Google
 * Play limits before anything is generated or uploaded. Copy claims only shipped behaviour and
 * never states a price: each store shows the price it localises (docs/product-decisions.md, pricing).
 */
import { APP_LOCALES, type AppLocale } from '@cp/domain';
import { z } from 'zod';

/** A price in copy, like `$3.99`, `3,99 €`, `S$4` or `99.000₫`. */
const PRICE = /([$€£¥₫฿₩]\s?\d)|(\d[\d.,]*\s?(€|₫|฿|₩|USD|EUR|VND))/u;

/** Store-facing copy of at most `max` characters that states no price. */
export const storeCopy = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(max, `at most ${max} characters`)
    .refine((text) => !PRICE.test(text), 'no prices in store copy: each store localises them');

/** Apple counts the keyword field in bytes: comma separated, no spaces, at most 100. */
const keywords = z
  .array(
    z
      .string()
      .trim()
      .min(1)
      .regex(/^[^,]+$/u),
  )
  .min(1)
  .refine(
    (words) => Buffer.byteLength(words.join(','), 'utf8') <= 100,
    'keywords: at most 100 bytes',
  )
  .refine(
    (words) => new Set(words.map((w) => w.toLowerCase())).size === words.length,
    'keywords repeat',
  );

/** Custom Product Page: its own promotional text and the screen it opens. */
export const customProductPageSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/u),
  /** App Store Connect reference name (not shown to people). */
  referenceName: z.string().min(1).max(64),
  promoText: storeCopy(170),
  /** Opens the app at this path when installed (iOS 18+ deep link per page). */
  deepLink: z.string().regex(/^https:\/\/critterpass\.app\//u),
  keywords: keywords.optional(),
});

export const IN_APP_EVENT_BADGES = [
  'challenge',
  'competition',
  'live-event',
  'major-update',
  'new-season',
  'premiere',
  'special-event',
] as const;

/** App Store In-App Event card (Apple: name 30, short 50, long 120). */
export const inAppEventSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/u),
  referenceName: z.string().min(1).max(64),
  badge: z.enum(IN_APP_EVENT_BADGES),
  name: storeCopy(30),
  shortDescription: storeCopy(50),
  longDescription: storeCopy(120),
  deepLink: z.string().regex(/^https:\/\/critterpass\.app\//u),
  /** Who sees it: everyone, or people who have not installed the app yet. */
  audience: z.enum(['all', 'new']),
});

export const listingSchema = z
  .object({
    appStore: z.object({
      name: storeCopy(30),
      subtitle: storeCopy(30),
      keywords,
      promoText: storeCopy(170),
      description: storeCopy(4000),
      releaseNotes: storeCopy(4000),
    }),
    play: z.object({
      title: storeCopy(30),
      shortDescription: storeCopy(80),
      fullDescription: storeCopy(4000),
    }),
    customProductPages: z.array(customProductPageSchema).max(70),
    inAppEvents: z.array(inAppEventSchema).max(10),
  })
  .superRefine((listing, ctx) => {
    // Apple already indexes the name and subtitle: repeating their words wastes keyword bytes.
    const indexed = `${listing.appStore.name} ${listing.appStore.subtitle}`.toLowerCase();
    for (const word of listing.appStore.keywords) {
      if (indexed.split(/[^\p{L}\p{N}]+/u).includes(word.toLowerCase())) {
        ctx.addIssue({
          code: 'custom',
          path: ['appStore', 'keywords'],
          message: `keyword "${word}" is already in the name or subtitle`,
        });
      }
    }
  });
export type Listing = z.infer<typeof listingSchema>;

/** Listing-wide settings that do not change per language. */
export const STORE_URLS = {
  marketing: 'https://critterpass.app',
  support: 'https://critterpass.app/legal/support',
  privacy: 'https://critterpass.app/legal/privacy',
} as const;

/** Our app locales to each store's locale codes. */
export const STORE_LOCALES: Readonly<Record<AppLocale, { appStore: string; play: string }>> = {
  en: { appStore: 'en-US', play: 'en-US' },
  'zh-Hans': { appStore: 'zh-Hans', play: 'zh-CN' },
  id: { appStore: 'id', play: 'id' },
  ja: { appStore: 'ja', play: 'ja-JP' },
  es: { appStore: 'es-ES', play: 'es-ES' },
  pt: { appStore: 'pt-BR', play: 'pt-BR' },
  fr: { appStore: 'fr-FR', play: 'fr-FR' },
  ko: { appStore: 'ko', play: 'ko-KR' },
  th: { appStore: 'th', play: 'th' },
  vi: { appStore: 'vi', play: 'vi' },
};

export function isListingLocale(value: string): value is AppLocale {
  return (APP_LOCALES as readonly string[]).includes(value);
}
