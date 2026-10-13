import { AddressScreen } from '@/features/album/mailing/address-screen';
import { PremiumAddressScreen } from '@/features/album/premium/address-screen';
import { premiumRoute } from '@/lib/premium-ui';

/** The traveller's own postal address for printed postcards. */
export default premiumRoute({ premium: PremiumAddressScreen, legacy: AddressScreen });
