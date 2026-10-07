/**
 * The one line Home says about a link that could not be followed. The link router sends such a
 * link to Home with `notice` and `at`, the moment it was routed (lib/links/route-map.ts), and Home
 * shows it as a toast, once per link. The address keeps those params (a link to `/` is forwarded
 * into the tabs, and they stay on the routes it passed through), so "once" is remembered here by
 * (`notice`, `at`): coming back to Home never says it again, the same notice from a later link is
 * said again, and an address older than a minute (navigation restored after a restart) is left
 * alone. On a cold start from such a link Home mounts under the launch screen: the toast waits
 * until that has gone, or its few seconds would pass where nobody can see it.
 */
import { useLingui } from '@lingui/react/macro';
import { useEffect } from 'react';

import type { LinkNotice } from '@/lib/links/route-map';
import { toast } from '@/motion/island-toast';

// eslint-disable-next-line lingui/no-unlocalized-strings -- param values, never rendered copy.
const NOTICES: readonly LinkNotice[] = ['link_unknown', 'link_already_member', 'link_unavailable'];

/** A notice routed longer ago than this was for an earlier visit to Home. */
export const NOTICE_FRESH_MS = 60_000;

const said = new Set<string>();

/** Test-only: a fresh start of the app, where nothing has been said yet. */
export function resetLinkNoticesForTests(): void {
  said.clear();
}

export function isLinkNotice(value: unknown): value is LinkNotice {
  return typeof value === 'string' && (NOTICES as readonly string[]).includes(value);
}

export interface LinkNoticeParams {
  readonly notice: string | null;
  /** When the link was routed (ms since the epoch, as the address carries it). */
  readonly at: string | null;
}

export function useLinkNotice(
  { notice, at }: LinkNoticeParams,
  visible = true,
  now: () => number = Date.now,
): void {
  const { t } = useLingui();
  useEffect(() => {
    if (notice === null || at === null || !visible) return;
    const key = `${notice}:${at}`;
    if (said.has(key)) return;
    said.add(key);
    const age = now() - Number(at);
    if (!(age >= 0 && age < NOTICE_FRESH_MS)) return;
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
  }, [notice, at, visible, t, now]);
}
