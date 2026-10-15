/* eslint-disable lingui/no-unlocalized-strings -- category keys and folded search words, never copy. */
import type { PoiCategory } from '@cp/domain';
import { t } from '@lingui/core/macro';
import type { DoodleName } from '@/ui/premium/icons/doodles/generated';

export interface BrowseTile {
  readonly key: string;
  readonly category: PoiCategory;
  /**
   * The places list's own filter for this kind; null where the list has no such group (a view or a
   * waterfall is nature there), so the tile asks for the kind in words instead.
   */
  readonly filter: string | null;
  /** The folded word the phone's search reads for it ("coffee"). */
  readonly word: string;
  readonly icon: DoodleName;
  readonly label: () => string;
}

export const BROWSE_TILES: readonly BrowseTile[] = [
  {
    key: 'food',
    category: 'food',
    filter: 'food',
    word: 'food',
    icon: 'food',
    label: () => t({ id: 'search.browse.food', message: 'Food' }),
  },
  {
    key: 'temples',
    category: 'temple_shrine',
    filter: 'temples',
    word: 'temple',
    icon: 'temple',
    label: () => t({ id: 'search.browse.temples', message: 'Temples' }),
  },
  {
    key: 'waterfalls',
    category: 'nature',
    filter: null,
    word: 'waterfall',
    icon: 'wave',
    label: () => t({ id: 'search.browse.waterfalls', message: 'Waterfalls' }),
  },
  {
    key: 'beaches',
    category: 'beach',
    filter: 'beaches',
    word: 'beach',
    icon: 'sun',
    label: () => t({ id: 'search.browse.beaches', message: 'Beaches' }),
  },
  {
    key: 'spa',
    category: 'health',
    filter: 'wellness',
    word: 'spa',
    icon: 'heart',
    label: () => t({ id: 'search.browse.spa', message: 'Spa' }),
  },
  // Coffee shared the food bowl; the design's sixth kind is the views, under the camera.
  {
    key: 'views',
    category: 'nature',
    filter: null,
    word: 'view',
    icon: 'camera',
    label: () => t({ id: 'search.browse.views', message: 'Views' }),
  },
];
