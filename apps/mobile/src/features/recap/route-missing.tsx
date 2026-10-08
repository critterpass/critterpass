/** A recap route opened without the id it is about: "not here", with a way back Home. */
import { useLingui } from '@lingui/react/macro';

import { ScreenMissing } from '@/ui/states/ScreenMissing';

export function RouteMissing({ testID }: { readonly testID: string }) {
  const { t } = useLingui();
  return (
    <ScreenMissing backLabel={t({ id: 'recap.link.back', message: 'Home' })} testID={testID} />
  );
}
