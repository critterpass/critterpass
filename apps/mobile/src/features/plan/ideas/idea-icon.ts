/** An idea's doodle by its place's kind (a dropped pin is a pin). */
import type { DoodleName } from '@/ui/icons/generated';

const ICONS: Readonly<Record<string, DoodleName>> = {
  temple_shrine: 'temple',
  food: 'food',
  market: 'food',
  nature: 'volcano',
  beach: 'wave',
  museum: 'star',
  nightlife: 'flame',
  shopping: 'ticket',
  transit: 'car',
  stay: 'bed',
  health: 'spark',
};

export function ideaIcon(category: string): DoodleName {
  return ICONS[category] ?? 'pin';
}
