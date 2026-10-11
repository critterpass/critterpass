/**
 * The three appearance choices as the app writes them (Edit profile's row and its sheet).
 */
import { useLingui } from '@lingui/react/macro';

import type { Appearance } from '@/ui/premium';

export function useAppearanceWords(): Readonly<Record<Appearance, string>> {
  const { t } = useLingui();
  return {
    system: t({ id: 'you.premium.appearance.system', message: 'Follows the phone' }),
    light: t({ id: 'you.premium.appearance.light', message: 'Light' }),
    dark: t({ id: 'you.premium.appearance.dark', message: 'Dark' }),
  };
}
