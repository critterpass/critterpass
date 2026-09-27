// Realistic-shaped fixture props for each template's golden snapshot — content is a founder-reviewable
// placeholder (no verified design copy source for this phase), following this codebase's existing
// convention for unverified content (see `../../forms/designed.ts`'s own placeholder names).
import type { CritterCardProps } from '../critter-card';
import type { MemoryProps } from '../memory';
import type { PlanPreviewProps } from '../plan-preview';
import type { PostcardProps } from '../postcard';
import type { PosterProps } from '../poster';
import type { RecapAwardsProps } from '../recap-awards';
import type { RecapCoverProps } from '../recap-cover';
import type { RecapMissedProps } from '../recap-missed';
import type { RecapReceiptProps } from '../recap-receipt';
import type { RecapRouteProps } from '../recap-route';
import type { RecapStampProps } from '../recap-stamp';

export const critterCardFixture: CritterCardProps = {
  name: 'Tokek',
  formName: 'rare',
  city: 'Bali',
  kind: 'gecko',
  seed: 7,
};

export const recapCoverFixture: RecapCoverProps = {
  tripName: 'Vietnam & Indonesia, 2026',
  dateRange: 'Sep 2 – Sep 18',
  heroKind: 'tanuki',
  heroSeed: 61,
};

export const recapRouteFixture: RecapRouteProps = {
  tripName: 'Vietnam & Indonesia, 2026',
  stops: [
    { city: 'Hà Nội', kind: 'gecko', seed: 1 },
    { city: 'Hội An', kind: 'sardine', seed: 5 },
    { city: 'Bali', kind: 'gecko', seed: 112 },
  ],
};

export const recapAwardsFixture: RecapAwardsProps = {
  tripName: 'Vietnam & Indonesia, 2026',
  mvpName: 'Tokek',
  mvpKind: 'gecko',
  mvpSeed: 7,
  awardLabel: 'Most Spotted',
};

export const recapReceiptFixture: RecapReceiptProps = {
  tripName: 'Vietnam & Indonesia, 2026',
  lines: [
    { label: 'Flights', value: '$640' },
    { label: 'Stays', value: '$410' },
    { label: 'Food', value: '$210' },
  ],
  total: '$1,260',
};

export const recapMissedFixture: RecapMissedProps = {
  kind: 'axolotl',
  seed: 42,
  city: 'Hạ Long',
};

export const recapStampFixture: RecapStampProps = {
  tripName: 'Vietnam & Indonesia, 2026',
  kind: 'puffin',
  seed: 3,
  crewSignatures: ['Khánh', 'Minh'],
};

export const postcardFixture: PostcardProps = {
  tripName: 'Vietnam & Indonesia, 2026',
  city: 'Bali',
  message: 'Wish you were here — found a whole family of gecko friends today.',
  senderName: 'Khánh',
  kind: 'gecko',
  seed: 7,
};

export const planPreviewFixture: PlanPreviewProps = {
  planName: 'Weekend in Hội An',
  dateRange: 'Oct 10 – Oct 12',
  members: [
    { name: 'Khánh', kind: 'gecko', seed: 7 },
    { name: 'Minh', kind: 'sardine', seed: 5 },
  ],
};

export const memoryFixture: MemoryProps = {
  kind: 'gecko',
  seed: 7,
  critterName: 'Tokek',
  city: 'Bali',
  yearsAgo: 1,
};

export const posterFixture: PosterProps = {
  title: 'Where next?',
  entries: [
    { kind: 'gecko', seed: 7, label: 'Bali' },
    { kind: 'sardine', seed: 5, label: 'Hội An' },
    { kind: 'tanuki', seed: 61, label: 'Kyoto' },
  ],
};
