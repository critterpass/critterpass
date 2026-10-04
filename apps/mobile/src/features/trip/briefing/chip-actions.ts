/**
 * What a briefing chip does: every tap is `act_briefing_item` (queued offline, so the chip changes
 * at once); a nudge also says who was nudged, and OPEN follows the line's link.
 */
/* eslint-disable lingui/no-unlocalized-strings -- command names and URL schemes, never copy. */
import { currentAppPath, type ActBriefingItemPayload } from '@cp/domain';
import { format } from '@cp/i18n';
import { msg, t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { useCallback } from 'react';
import { Linking } from 'react-native';

import { defineClientCommand } from '@/data/commands/summaries';
import { useCommand } from '@/data/commands/use-command';
import { useLocale } from '@/lib/i18n/use-locale';
import { toast } from '@/motion';

import { ACT_BRIEFING_ITEM, type BriefingLine } from './briefing-model';

export const actBriefingItemCommand = defineClientCommand<ActBriefingItemPayload>({
  name: ACT_BRIEFING_ITEM,
  offline: true,
  summarize: () => msg({ id: 'trip.briefing.queued', message: 'Your briefing' }),
});

/**
 * Opens a briefing link: an app path in the app (lines written earlier name the trip hub and its
 * day by their former paths), anything else with the system.
 */
export function openBriefingLink(link: string): void {
  if (link.startsWith('/')) router.push(currentAppPath(link));
  else void Linking.openURL(link).catch(() => false);
}

export function useBriefingActions(names: ReadonlyMap<string, string>) {
  const locale = useLocale();
  const { send } = useCommand(actBriefingItemCommand);
  return useCallback(
    (line: BriefingLine) => {
      void send({ item_id: line.id, action: line.action });
      if (line.action === 'nudge') {
        const who = format.list(
          locale,
          line.targets.map((id) => names.get(id) ?? '').filter((name) => name !== ''),
          { type: 'conjunction' },
        );
        toast.show({
          id: `trip-briefing-nudge-${line.id}`,
          title:
            who === ''
              ? t({ id: 'trip.briefing.nudgedSome', message: 'Nudged.' })
              : t({ id: 'trip.briefing.nudged', message: `Nudged ${who}.` }),
        });
      }
      if (line.action === 'open' && line.deepLink !== null) openBriefingLink(line.deepLink);
    },
    [send, names, locale],
  );
}
