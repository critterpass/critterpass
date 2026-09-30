/* eslint-disable lingui/no-unlocalized-strings -- row names and sample words, only in the (dev) type lab. */
import type { TextVariant } from '../Text';

/**
 * Fixed rows of the type lab: every label component in each of its label variants, then every text
 * face in a plain padded box, in English, Vietnamese (stacked marks) and Thai. A row names the
 * `Text` variant its component sets the label in, so the scene can draw the ideal cap box for it.
 * Kept free of React so a capture's rows can be listed next to its measured offsets.
 */

export type TypeLabLocale = 'en' | 'vi' | 'th';
export type TypeLabGroup = 'buttons' | 'actions' | 'chips' | 'faces';

export const TYPE_LAB_LOCALES: readonly TypeLabLocale[] = ['en', 'vi', 'th'];
export const TYPE_LAB_GROUPS: readonly TypeLabGroup[] = ['buttons', 'actions', 'chips', 'faces'];

export type TypeLabComponent =
  | 'pill-lg-primary'
  | 'pill-lg-secondary'
  | 'pill-lg-sentence'
  | 'pill-sm-primary'
  | 'pill-sm-secondary'
  | 'inline-choice'
  | 'inline-selected'
  | 'inline-ghost'
  | 'action-primary'
  | 'action-outline'
  | 'action-secondary'
  | 'header-action'
  | 'header-private'
  | 'header-countdown'
  | 'segmented'
  | 'quick-action'
  | 'choice'
  | 'choice-selected'
  | 'filter'
  | 'filter-selected'
  | 'status'
  | 'info-solid'
  | 'info-outline'
  | 'count-badge'
  | 'tier'
  | 'face';

export interface TypeLabRow {
  readonly name: string;
  readonly component: TypeLabComponent;
  readonly variant: TextVariant;
  /** Mixed case where the component sets the label as written. */
  readonly word: 'caps' | 'mixed';
  /** Rows whose text is Latin whatever the locale (tier words, digits) sit out the Thai pages. */
  readonly latinOnly?: boolean;
}

/** The label per locale: a plain word and one with the script's tallest marks. */
export const TYPE_LAB_WORDS: Readonly<Record<TypeLabLocale, Record<TypeLabRow['word'], string>>> = {
  en: { caps: 'Next', mixed: 'Hold on' },
  vi: { caps: 'Đặt chỗ', mixed: 'Việt Nam' },
  th: { caps: 'ถัดไป', mixed: 'สวัสดี' },
};

const row = (
  name: string,
  component: TypeLabComponent,
  variant: TextVariant,
  word: TypeLabRow['word'] = 'caps',
  latinOnly = false,
): TypeLabRow => ({ name, component, variant, word, ...(latinOnly ? { latinOnly } : {}) });

const FACE_VARIANTS: readonly TextVariant[] = [
  'buttonLg',
  'buttonSm',
  'title',
  'h3',
  'label',
  'eyebrow',
  'rowTitle',
  'body',
  'caption',
  'monoData',
  'voice',
];

const ROWS: Readonly<Record<TypeLabGroup, readonly TypeLabRow[]>> = {
  buttons: [
    row('PillButton lg primary', 'pill-lg-primary', 'buttonLg'),
    row('PillButton lg secondary', 'pill-lg-secondary', 'buttonLg'),
    row('PillButton lg sentence', 'pill-lg-sentence', 'rowTitle', 'mixed'),
    row('PillButton sm primary', 'pill-sm-primary', 'buttonSm'),
    row('PillButton sm secondary', 'pill-sm-secondary', 'buttonSm'),
    row('InlineAction choice', 'inline-choice', 'buttonSm'),
    row('InlineAction selected', 'inline-selected', 'buttonSm'),
    row('InlineAction ghost', 'inline-ghost', 'buttonSm'),
  ],
  actions: [
    row('ActionPill primary', 'action-primary', 'buttonSm'),
    row('ActionPill outline', 'action-outline', 'buttonSm'),
    row('ActionPill secondary', 'action-secondary', 'buttonSm'),
    row('HeaderPill action', 'header-action', 'label'),
    row('HeaderPill private', 'header-private', 'label'),
    row('HeaderPill countdown', 'header-countdown', 'label'),
    row('Segmented', 'segmented', 'label'),
    row('QuickActionChip', 'quick-action', 'bodySm', 'mixed'),
  ],
  chips: [
    row('ChoiceChip', 'choice', 'label'),
    row('ChoiceChip selected', 'choice-selected', 'label'),
    row('FilterChip', 'filter', 'label'),
    row('FilterChip selected', 'filter-selected', 'label'),
    row('StatusChip', 'status', 'label'),
    row('InfoPill solid', 'info-solid', 'label'),
    row('InfoPill outline', 'info-outline', 'label'),
    row('CountBadge', 'count-badge', 'label', 'caps', true),
    row('TierLabel', 'tier', 'label', 'caps', true),
  ],
  faces: FACE_VARIANTS.map((variant) =>
    row(`Text ${variant}`, 'face', variant, variant === 'voice' ? 'mixed' : 'caps'),
  ),
};

/** The rows one page shows, top to bottom (Thai pages leave out Latin-only rows). */
export function typeLabRows(group: TypeLabGroup, locale: TypeLabLocale): readonly TypeLabRow[] {
  return ROWS[group].filter((entry) => locale !== 'th' || entry.latinOnly !== true);
}

export interface TypeLabPage {
  readonly id: string;
  readonly group: TypeLabGroup;
  readonly locale: TypeLabLocale;
  /** Guide lines over each component; off, the page is clean for measuring. */
  readonly guides: boolean;
}

export const TYPE_LAB_PAGES: readonly TypeLabPage[] = TYPE_LAB_LOCALES.flatMap((locale) =>
  TYPE_LAB_GROUPS.flatMap((group) =>
    [false, true].map((guides) => ({
      id: `${group}-${locale}${guides ? '-guides' : ''}`,
      group,
      locale,
      guides,
    })),
  ),
);
