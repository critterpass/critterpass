/**
 * How a release item reads in the review grid: its title, a secondary line, and for critter kinds
 * which critter and form to draw. Items arrive as plain records from the api.
 */
import type { FormSpec } from '@cp/critter-art';
import { critters } from '@cp/critter-art';

type Item = Readonly<Record<string, unknown>>;

const cityOf = new Map(critters.map((critter) => [critter.id, critter.city]));

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

export interface ItemFace {
  readonly title: string;
  readonly subtitle: string;
  /** Critter to draw, when the kind has one. */
  readonly critterId?: string;
  readonly form?: FormSpec;
  /** A still to show (a media candidate's preview), and the page it links to. */
  readonly imageUrl?: string;
  readonly linkUrl?: string;
}

export function itemFace(kind: string, ref: string, item: Item): ItemFace {
  switch (kind) {
    case 'forms': {
      const critterId = text(item['critter_id']);
      return {
        title: text(item['name']),
        subtitle: `${text(item['rarity'])} · ${cityOf.get(critterId) ?? critterId}`,
        critterId,
        form: {
          rarity: item['rarity'] as FormSpec['rarity'],
          palette: item['palette'] as FormSpec['palette'],
          edge: item['edge'] as FormSpec['edge'],
          ...(typeof item['pose'] === 'string'
            ? { pose: item['pose'] as FormSpec['pose'] & string }
            : {}),
        },
      };
    }
    case 'critters':
      return { title: text(item['name']), subtitle: text(item['city']), critterId: ref };
    case 'windows':
      return { title: ref, subtitle: text(item['place_line']) };
    case 'spawns':
      return {
        title: text(item['copy']),
        subtitle: `${text(item['kind'])} · ${text(item['form_id'])}`,
      };
    case 'phrases':
      return { title: text(item['text']), subtitle: `“${text(item['gloss'])}”` };
    case 'places':
      return { title: text(item['name']), subtitle: text(item['category']) };
    case 'sets':
      return {
        title: text(item['name']),
        subtitle: `${text(item['coverage'])} · ${text(item['tz'])}`,
      };
    case 'help':
    case 'insurance':
      return {
        title: text(item['title']),
        subtitle: text(item['category']) || text(item['country']),
      };
    case 'personas':
      return { title: ref, subtitle: text(item['ai_disclosure']) };
    case 'emergency':
      return { title: ref, subtitle: text(item['source_url']) };
    case 'facilities':
      return { title: text(item['name']), subtitle: text(item['kind']) };
    case 'media': {
      const subjects = (item['subjects'] as string[] | undefined) ?? [];
      return {
        title:
          `${item['kind'] === 'video' ? 'Video' : 'Photo'} · ${text(item['title']) || ref}`.slice(
            0,
            80,
          ),
        // An item re-stated with no subjects takes the live photo down.
        subtitle:
          subjects.length === 0
            ? `${text(item['credit'])} · Removes this photo from live`
            : `${text(item['credit'])} · #${String(item['rank'])} · ${subjects.join(', ')}`,
        imageUrl: text(item['preview_url']),
        linkUrl: text(item['source_url']),
      };
    }
    case 'taste_quiz':
      return { title: text(item['chip']), subtitle: ref };
    default:
      return { title: ref, subtitle: '' };
  }
}

/** Fields that differ between the live item and the batch's, for the side-by-side. */
export function changedFields(previous: Item | null, next: Item): string[] {
  if (previous === null) return Object.keys(next);
  return Object.keys({ ...previous, ...next }).filter(
    (key) => JSON.stringify(previous[key]) !== JSON.stringify(next[key]),
  );
}

export const STAGES = [
  'brief',
  'generate',
  'validate',
  'render',
  'review',
  'approve',
  'publish',
] as const;

export const GATE_LABEL: Readonly<Record<string, string>> = {
  ip_signoff: 'IP sign-off',
  contact_sheets: 'Contact sheets',
  places_review: 'Places review',
  window_sources: 'Window sources',
  persona_review: 'Persona review',
  native_review: 'Native speaker',
  record_verification: 'Record check',
  owner_approval: 'Owner',
};

export function formatUsd(micros: number): string {
  return `$${(micros / 1_000_000).toFixed(2)}`;
}
