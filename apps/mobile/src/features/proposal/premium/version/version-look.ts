/** The member's version and the sheets it opens, in the premium look. */
import type { YourVersionLook } from '../../your-version/your-version-screen';
import { PremiumHypeBar } from './hype';
import { PremiumObjectionView } from './objection-view';
import { PremiumShareCard } from './share-card';
import { PremiumYourVersionView } from './version-view';
import { PremiumWhySheet } from './why-sheet';

export const PREMIUM_VERSION_LOOK: YourVersionLook = {
  View: PremiumYourVersionView,
  ShareCard: PremiumShareCard,
  HypeBar: PremiumHypeBar,
  WhySheet: PremiumWhySheet,
  Objection: PremiumObjectionView,
};
