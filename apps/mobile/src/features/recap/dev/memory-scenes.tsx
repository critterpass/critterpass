/**
 * Lab scenes for the year-later memory (3m-10) over the Đà Nẵng fixtures: the crew's reactions in,
 * the first one to open it (no reactions yet), a traveller who left the crew (no reunion, a former
 * member among the reactions), a recap this phone no longer has (the guide's stored line), and the
 * reaction sheet open. The words come from the screen's own builders; handlers are no-ops except
 * the sheet's.
 */
/* eslint-disable lingui/no-unlocalized-strings -- fixture values, only in the (dev) lab. */
import { tokens } from '@cp/design-tokens';
import { t } from '@lingui/core/macro';
import { useState, type ReactNode } from 'react';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';

import { memoryBody, memoryTitle } from '../memory/memory-copy';
import { memoryMoment, reactionChips, type MemoryReactionRow } from '../memory/memory-model';
import { MemoryView } from '../memory/memory-view';
import { ReactionSheet } from '../memory/reaction-sheet';
import { ALEX, JORDAN, MAYA, ME, STATS } from './recap-fixtures';

const noop = () => undefined;
const REACTIONS: readonly MemoryReactionRow[] = [
  { user_id: MAYA, emoji: '❤', text: null, name: 'Maya', colour: tokens.color.pink },
  { user_id: JORDAN, emoji: null, text: 'again??', name: 'Jordan', colour: tokens.color.yellow },
  { user_id: ALEX, emoji: '❤', text: null, name: 'Alex', colour: tokens.color.blue },
  { user_id: ME, emoji: '+1', text: null, name: 'Winston', colour: tokens.color.green.base },
];
const WRITTEN = 'A year ago today: Đà Nẵng. Up and out at 05:10 for Sơn Trà.';

function Scene({
  reactions = REACTIONS,
  inCrew = true,
  stats = true,
  reacting = false,
}: {
  readonly reactions?: readonly MemoryReactionRow[];
  readonly inCrew?: boolean;
  readonly stats?: boolean;
  readonly reacting?: boolean;
}) {
  const locale = useLocale();
  const [sheet, setSheet] = useState(reacting);
  const guide = guideSticker('chava');
  return (
    <>
      <MemoryView
        title={memoryTitle('Đà Nẵng')}
        body={memoryBody(locale, '2026-10-03', memoryMoment(stats ? STATS : null, WRITTEN))}
        eyebrow={t({ id: 'recap.memory.eyebrow', message: 'One year ago today' })}
        photoUrl={null}
        guideKind={guide.kind}
        guideName="Chà Vá"
        reactions={reactionChips(reactions, [], ME)}
        onClose={noop}
        onReact={() => setSheet(true)}
        onReunion={inCrew ? noop : undefined}
        onShare={noop}
      />
      {sheet ? (
        <ReactionSheet
          initial={null}
          onSend={() => setSheet(false)}
          onClose={() => setSheet(false)}
        />
      ) : null}
    </>
  );
}

export const MEMORY_SCENES: Readonly<Record<string, () => ReactNode>> = {
  '3m-10-memory': () => <Scene />,
  '3m-10-first': () => <Scene reactions={[]} />,
  '3m-10-left-crew': () => (
    <Scene
      inCrew={false}
      reactions={[
        ...REACTIONS.slice(0, 2),
        { user_id: ALEX, emoji: '🔥', text: null, name: '', colour: null },
      ]}
    />
  ),
  '3m-10-no-recap': () => <Scene stats={false} />,
  '3m-10-react': () => <Scene reacting />,
};
