import { PhotoScreen } from '@/features/onboarding/photo/PhotoScreen';
import { PremiumPhotoPage } from '@/features/onboarding/premium/photo/PremiumPhotoPage';
import { premiumRoute } from '@/lib/premium-ui';

export default premiumRoute({ premium: PremiumPhotoPage, legacy: PhotoScreen });
