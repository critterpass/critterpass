/**
 * What an album route shows when it was opened without the trip (or photo) it needs: the app's
 * "not here" state with a way back, never a blank screen.
 */
import { useLingui } from '@lingui/react/macro';

import { ScreenMissing } from '@/ui/states/ScreenMissing';

export function AlbumMissing({ testID }: { readonly testID: string }) {
  const { t } = useLingui();
  return (
    <ScreenMissing backLabel={t({ id: 'album.address.back', message: 'Back' })} testID={testID} />
  );
}
