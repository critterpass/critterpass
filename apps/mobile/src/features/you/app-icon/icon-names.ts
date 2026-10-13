import type { AppIconBaseId } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';

/** The app icons' names, as the picker labels them. */
export function useIconNames(): Readonly<Partial<Record<AppIconBaseId, string>>> {
  const { t } = useLingui();
  return {
    face: t({ id: 'you.appIcon.face', message: 'Face' }),
    passport: t({ id: 'you.appIcon.passport', message: 'Passport' }),
    temple: t({ id: 'you.appIcon.temple', message: 'Temple' }),
    sardi: t({ id: 'you.appIcon.sardi', message: 'Sardi' }),
    pon: t({ id: 'you.appIcon.pon', message: 'Pon' }),
  };
}
