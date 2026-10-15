/**
 * The ground a place without a photo is drawn on: its kind's pastel (food yellow, temples
 * tangerine, nature green, beaches blue, museums and nights out pink), the same tints the Find
 * tiles and status tags use, so a card with no photo still reads as that kind of place.
 */
import type { NoPhotoAccent, PremiumTheme } from '@/ui/premium';

type Tint = keyof PremiumTheme['color']['status'];

const TINTS: Readonly<Record<string, Tint>> = {
  food: 'maybe',
  market: 'maybe',
  shopping: 'maybe',
  temple_shrine: 'tangerine',
  nature: 'booked',
  health: 'booked',
  beach: 'rain',
  stay: 'rain',
  museum: 'voteOpen',
  nightlife: 'voteOpen',
};

export function placeTint(theme: PremiumTheme, category: string | null): string {
  const tint = category === null ? undefined : TINTS[category];
  return tint === undefined ? theme.color.status.unopened.bg : theme.color.status[tint].bg;
}

/** The place's colour for the kit's no-photo art, from the same kinds as its pastel. */
const ACCENTS: Partial<Record<Tint, NoPhotoAccent>> = {
  maybe: 'sun',
  tangerine: 'tangerine',
  booked: 'mint',
  voteOpen: 'pink',
};

export function placeAccent(category: string | null): NoPhotoAccent {
  const tint = category === null ? undefined : TINTS[category];
  return (tint === undefined ? undefined : ACCENTS[tint]) ?? 'sky';
}
