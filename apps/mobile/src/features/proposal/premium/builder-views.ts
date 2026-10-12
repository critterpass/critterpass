import type { BuilderViews } from '../builder/views';
import { PremiumAloneView } from './alone-view';
import { PremiumBuilderView } from './builder-view';
import { PremiumReplyBySheet } from './reply-by-sheet';
import { PremiumSendProgress } from './send-progress';

/** The proposal builder's faces in the premium look (the route picks them when premium is on). */
export const PREMIUM_BUILDER_VIEWS: BuilderViews = {
  Builder: PremiumBuilderView,
  Alone: PremiumAloneView,
  Sent: PremiumSendProgress,
  ReplyBy: PremiumReplyBySheet,
};
