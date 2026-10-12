import { ManifestScreen } from '@/features/onboarding/invited/ManifestScreen';
import { PremiumManifestPage } from '@/features/onboarding/premium/invite/PremiumManifestPage';
import { premiumRoute } from '@/lib/premium-ui';

export default premiumRoute({ premium: PremiumManifestPage, legacy: ManifestScreen });
