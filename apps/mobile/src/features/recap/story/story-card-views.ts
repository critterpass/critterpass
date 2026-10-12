/** The components that draw the story's cards: the current look by default, or the premium one. */
import type { ComponentType } from 'react';

import { AwardsCard, type AwardsCardProps } from '../cards/awards-card';
import { CoverCard, type CoverCardProps } from '../cards/cover-card';
import { CrittersCard, type CrittersCardProps } from '../cards/critters-card';
import { GotAwayCard, type GotAwayCardProps } from '../cards/got-away-card';
import { PostcardCard, type PostcardCardProps } from '../cards/postcard-card';
import { ReceiptCard, type ReceiptCardProps } from '../cards/receipt-card';
import { RouteCard, type RouteCardProps } from '../cards/route-card';
import { StampCard, type StampCardProps } from '../cards/stamp-card';

export interface StoryCardViews {
  readonly Cover: ComponentType<CoverCardProps>;
  readonly Critters: ComponentType<CrittersCardProps>;
  readonly Route: ComponentType<RouteCardProps>;
  readonly Awards: ComponentType<AwardsCardProps>;
  readonly Receipt: ComponentType<ReceiptCardProps>;
  readonly GotAway: ComponentType<GotAwayCardProps>;
  readonly Stamp: ComponentType<StampCardProps>;
  readonly Postcard: ComponentType<PostcardCardProps>;
}

export const CURRENT_CARD_VIEWS: StoryCardViews = {
  Cover: CoverCard,
  Critters: CrittersCard,
  Route: RouteCard,
  Awards: AwardsCard,
  Receipt: ReceiptCard,
  GotAway: GotAwayCard,
  Stamp: StampCard,
  Postcard: PostcardCard,
};
