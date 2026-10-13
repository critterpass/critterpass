import { ArticlePremiumScreen } from '@/features/help/premium/article-premium-screen';
import { ReaderScreen } from '@/features/help/reader/reader-screen';
import { premiumRoute } from '@/lib/premium-ui';

/** A help centre article. */
function LegacyHelpArticleRoute() {
  return <ReaderScreen />;
}

export default premiumRoute({ premium: ArticlePremiumScreen, legacy: LegacyHelpArticleRoute });
