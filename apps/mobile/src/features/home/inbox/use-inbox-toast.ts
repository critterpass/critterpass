/**
 * An island toast for something that starts needing the user while the app is open: the guide
 * finished placing their ideas, a plan arrived for their answer, a crewmate answered. The push for
 * these may be held back or silent, and the bell alone is easy to miss; the toast says it once,
 * with the item's own action. Items that were already waiting when the app opened stay quiet.
 */
/* eslint-disable lingui/no-unlocalized-strings -- inbox kinds, never copy. */
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';

import { currentAppPath, IDEAS_INBOX_KIND, PROPOSAL_INBOX_KIND } from '@cp/domain';

import { toast } from '@/motion/island-toast';

import { isExpired, useInboxItems, type InboxItem } from './inbox-data';
import { inboxRenderer } from './kind-renderers';

const TOASTED: ReadonlySet<string> = new Set([
  IDEAS_INBOX_KIND.placed,
  PROPOSAL_INBOX_KIND.received,
  PROPOSAL_INBOX_KIND.answered,
]);

/** How many of the newest items are watched: an arrival is always among them. */
const WATCHED = 10;

/** The open needs-you items of a toasted kind the user has not been told about yet. */
export function arrivals(
  items: readonly InboxItem[],
  told: ReadonlySet<string>,
  now: Date,
): InboxItem[] {
  return items.filter(
    (item) =>
      TOASTED.has(item.kind) &&
      item.needsYou &&
      !item.resolved &&
      !isExpired(item, now) &&
      !told.has(item.id),
  );
}

export function useInboxToast(uid: string | null): void {
  const { i18n } = useLingui();
  const { items, loaded } = useInboxItems(uid, WATCHED);
  // null until the first read: what is already waiting then is not news.
  const told = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!loaded) return;
    const now = new Date();
    if (told.current === null) {
      told.current = new Set(items.map((item) => item.id));
      return;
    }
    for (const item of arrivals(items, told.current, now)) {
      told.current.add(item.id);
      const renderer = inboxRenderer(item.kind);
      const ctx = { i18n, now };
      const action = item.actions[0];
      const link = item.deepLink;
      toast.show({
        id: `inbox-${item.id}`,
        title: renderer.line(item, ctx),
        ...(action === undefined || link === null
          ? {}
          : {
              action: {
                label: renderer.actionLabel?.(action, item, ctx) ?? action.id,
                onPress: () => router.push(currentAppPath(link)),
              },
            }),
      });
    }
  }, [items, loaded, i18n]);
}
