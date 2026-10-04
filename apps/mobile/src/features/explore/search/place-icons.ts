/** The doodle for a place's category in search rows. */
import type { DoodleName } from '@/ui/icons/generated';

const ICONS: Readonly<Record<string, DoodleName>> = {
  food: 'food',
  temple_shrine: 'temple',
  nature: 'wave',
  beach: 'sun',
  museum: 'ticket',
  market: 'wallet',
  nightlife: 'star',
  shopping: 'wallet',
  stay: 'bed',
  transit: 'car',
  health: 'spark',
};

export function placeIcon(category: string | null): DoodleName {
  return (category === null ? undefined : ICONS[category]) ?? 'pin';
}
