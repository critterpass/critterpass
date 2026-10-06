/**
 * The one line Home says about a link that could not be followed. The link router sends such a
 * link to Home with a `notice` param (lib/links/route-map.ts); Home shows it once as a toast and
 * drops the param, so coming back to Home or re-rendering it never says it again.
 */
import { useLingui } from '@lingui/react/macro';
import { useNavigation } from 'expo-router';
import { useEffect } from 'react';

import type { LinkNotice } from '@/lib/links/route-map';
import { toast } from '@/motion/island-toast';

// eslint-disable-next-line lingui/no-unlocalized-strings -- param values, never rendered copy.
const NOTICES: readonly LinkNotice[] = ['link_unknown', 'link_already_member', 'link_unavailable'];

/** The Home route's own params, as far as this hook changes them. */
interface NoticeNavigation {
  readonly setParams: (params: { readonly notice: undefined }) => void;
}

export function isLinkNotice(value: unknown): value is LinkNotice {
  return typeof value === 'string' && (NOTICES as readonly string[]).includes(value);
}

export function useLinkNotice(notice: string | null): void {
  const { t } = useLingui();
  // This screen's own navigation: the param sits on the Home route, inside the tabs.
  const navigation: NoticeNavigation = useNavigation();
  useEffect(() => {
    if (notice === null) return;
    // Any `notice` leaves the address, known or not, so nothing lingers to be read again.
    navigation.setParams({ notice: undefined });
    if (!isLinkNotice(notice)) return;
    const title = {
      link_unknown: t({ id: 'home.linkNotice.unknown', message: 'That link couldn’t be opened' }),
      link_already_member: t({
        id: 'home.linkNotice.alreadyMember',
        message: 'That link is for new travellers. You already have your pass',
      }),
      link_unavailable: t({
        id: 'home.linkNotice.unavailable',
        message: 'That link isn’t available any more',
      }),
    }[notice];
    // eslint-disable-next-line lingui/no-unlocalized-strings -- a toast id, never rendered copy.
    toast.show({ id: `link-notice-${notice}`, title });
  }, [notice, t, navigation]);
}
