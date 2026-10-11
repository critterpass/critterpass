/**
 * The empty guide thread's four starters (5.13) and the offline tools card's chips (5.17). A
 * starter asks its question at once; with a trip, the fourth points the camera at a menu. The
 * offline chips are only those whose screens exist in this build.
 */
/* eslint-disable lingui/no-unlocalized-strings -- design screen ids (data keys), never copy. */
import { t } from '@lingui/core/macro';

import { hrefFor } from '@/lib/navigation/screen-registry';
import type { PremiumTheme } from '@/ui/premium';

import type { GuideStarter } from './guide-empty';
import type { OfflineTool } from './guide-offline';

export function guideStarters(
  th: PremiumTheme,
  {
    hasTrip,
    ask,
    camera,
  }: {
    readonly hasTrip: boolean;
    readonly ask: (question: string) => void;
    readonly camera?: () => void;
  },
): GuideStarter[] {
  const prompt = (
    key: string,
    doodle: GuideStarter['doodle'],
    color: string,
    question: string,
    line: string,
  ): GuideStarter => ({ key, doodle, color, title: question, line, onPress: () => ask(question) });
  if (!hasTrip) {
    return [
      prompt(
        'where',
        'pin',
        th.accent.tangerine,
        t({ id: 'guide.empty.promptWhere', message: 'Where should we go next?' }),
        t({ id: 'guide.premium.starter.whereLine', message: 'Ideas for your crew' }),
      ),
      prompt(
        'when',
        'cal',
        th.accent.sky,
        t({ id: 'guide.empty.promptWhen', message: 'Which month is best to go?' }),
        t({ id: 'guide.premium.starter.whenLine', message: 'Weather and crowds' }),
      ),
      prompt(
        'crew',
        'chat',
        th.accent.pink,
        t({ id: 'guide.empty.promptCrew', message: 'How do I get my crew planning?' }),
        t({ id: 'guide.premium.starter.crewLine', message: 'A first step for everyone' }),
      ),
    ];
  }
  const starters = [
    prompt(
      'food',
      'food',
      th.accent.tangerine,
      t({ id: 'guide.empty.promptFood', message: 'Where should we eat tonight?' }),
      t({ id: 'guide.premium.starter.foodLine', message: 'Near tonight’s plan' }),
    ),
    prompt(
      'rain',
      'boat',
      th.accent.sky,
      t({ id: 'guide.empty.promptRain', message: 'What if it rains tomorrow?' }),
      t({ id: 'guide.premium.starter.rainLine', message: 'Dry swaps for the day' }),
    ),
    prompt(
      'slow',
      'chat',
      th.accent.pink,
      t({ id: 'guide.empty.promptSlow', message: 'Can we make day 2 slower?' }),
      t({ id: 'guide.premium.starter.slowLine', message: 'Fewer stops, more time' }),
    ),
  ];
  if (camera === undefined) return starters;
  return [
    ...starters,
    {
      key: 'camera',
      doodle: 'camera',
      color: th.accent.mint,
      title: t({ id: 'guide.quick.menu', message: 'Translate a menu' }),
      line: t({ id: 'guide.premium.starter.cameraLine', message: 'Point the camera at it' }),
      onPress: camera,
    },
  ];
}

/** Point and ask: the menu camera, answering in this thread's mode. */
export function cameraHref(tripId: string | null, mode: string) {
  return tripId === null ? undefined : hrefFor('3j-3', { tripId, mode, from: 'guide' });
}

export function offlineTools(tripId: string | null): OfflineTool[] {
  const trip = tripId === null ? {} : { tripId };
  const candidates = [
    {
      key: 'phrases',
      label: t({ id: 'guide.premium.tool.phrases', message: 'Phrasebook' }),
      href: hrefFor('guide-practice', trip),
    },
    {
      key: 'emergency',
      label: t({ id: 'guide.premium.tool.emergency', message: 'Emergency numbers' }),
      href: hrefFor('3k-6', trip),
    },
    {
      key: 'today',
      label: t({ id: 'guide.premium.tool.today', message: 'Today’s plan' }),
      href: tripId === null ? undefined : hrefFor('3k-2', trip),
    },
    {
      key: 'bookings',
      label: t({ id: 'guide.premium.tool.bookings', message: 'Bookings' }),
      href: hrefFor('3h-1', trip),
    },
  ];
  return candidates.flatMap((tool) =>
    tool.href === undefined ? [] : [{ key: tool.key, label: tool.label, href: tool.href }],
  );
}
