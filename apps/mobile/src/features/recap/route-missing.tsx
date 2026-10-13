/** A recap route opened without the id it is about: "not here", with a way back Home (in either look). */
import { useLingui } from '@lingui/react/macro';

import { usePremiumUi } from '@/lib/premium-ui';
import { ScreenMissing } from '@/ui/states/ScreenMissing';

import { PremiumRouteMissing } from '@/features/album';

export function RouteMissing({ testID }: { readonly testID: string }) {
  const { t } = useLingui();
  const premium = usePremiumUi();
  if (premium) return <PremiumRouteMissing testID={testID} />;
  return (
    <ScreenMissing backLabel={t({ id: 'recap.link.back', message: 'Home' })} testID={testID} />
  );
}
