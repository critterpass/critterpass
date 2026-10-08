/**
 * Crew quests (3l-7) over synced rows: the view's model from the local database, the shared reward
 * moment from the trip's quest channel (a finished quest's reward spins onto every phone at once),
 * the crew level-up toast, and joining an optional quest.
 */
import { useLingui } from '@lingui/react/macro';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import { useSyncPhase } from '@/data/status/use-sync-status';
import { hrefFor, useScreenHref } from '@/lib/navigation/screen-registry';
import { feedback, toast, useMotionMode } from '@/motion';
import { guideSticker } from '@/ui/avatar/guides';
import { Sticker } from '@/ui/sticker/Sticker';

import { signupQuestCommand } from './commands';
import { useLiveRows } from './live-rows';
import { guideOfSlug, QuestsView } from './quests-view';
import { useBefriendSpot } from './use-befriend-spot';
import { useQuests } from './use-quests';
import { useRewardReveal } from './use-reward-reveal';

/* eslint-disable lingui/no-unlocalized-strings -- SQL and a screen registry key, never copy. */
const PRACTICE_SCREEN = 'guide-practice';
const PRACTICE_FLAG_SQL =
  "SELECT value FROM client_config WHERE key = 'guide.quick_actions.practise_phrases'";
const FLAG_TABLES = ['client_config'] as const;
const NO_PARAMS: readonly unknown[] = [];
/* eslint-enable lingui/no-unlocalized-strings */

export function QuestsScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const id = typeof tripId === 'string' && tripId.length > 0 ? tripId : null;
  useTripStreams(id);
  const { t } = useLingui();
  const syncPhase = useSyncPhase();
  const [motionMode] = useMotionMode();
  const { model, crewName, guideSlug } = useQuests(id);
  const befriend = model.cards.find((card) => card.befriend !== null && card.state === 'active');
  const befriendPlace = useBefriendSpot(
    id,
    befriend?.befriend?.set ?? null,
    befriend !== undefined,
  );
  const reveals = useRewardReveal(id, motionMode !== 'full');
  const signup = useCommand(signupQuestCommand);
  const guide = guideOfSlug(guideSlug);
  const art = guideSticker(guide);
  const toasted = useRef(new Set<string>());
  // Phrase practice is offered where the guide's own "Practise phrases" action is.
  const practiceFlag = useLiveRows<{ value: string | null }>(
    PRACTICE_FLAG_SQL,
    NO_PARAMS,
    FLAG_TABLES,
  );
  const practiceOn = practiceFlag.rows.some((row) => row.value === 'true' || row.value === '1');
  const practiceThere = useScreenHref(PRACTICE_SCREEN) !== undefined;
  const onPractise =
    !practiceOn || !practiceThere
      ? undefined
      : (language: string | null) => {
          const href = hrefFor(PRACTICE_SCREEN, {
            ...(id === null ? {} : { tripId: id }),
            ...(language === null ? {} : { lang: language }),
          });
          if (href !== undefined) router.push(href);
        };

  useEffect(() => {
    const levelUp = reveals.levelUp;
    if (levelUp === null || levelUp.sticker_id === null) return;
    if (toasted.current.has(levelUp.sticker_id)) return;
    toasted.current.add(levelUp.sticker_id);
    const level = levelUp.level ?? model.level.level;
    toast.show({
      // eslint-disable-next-line lingui/no-unlocalized-strings -- toast de-dupe key, never copy.
      id: `quests-level-${levelUp.sticker_id}`,
      sticker: <Sticker kind={art.kind} name={art.name} size={40} pose="cheer" />,
      title: t({ id: 'quests.levelUp.title', message: `Crew level ${level}!` }),
      subtitle: t({ id: 'quests.levelUp.line', message: 'A new crew sticker is on your pass.' }),
    });
  }, [reveals.levelUp, model.level.level, art, t]);

  async function onSignUp(questId: string) {
    const result = await signup.send({ quest_id: questId });
    if (result.kind === 'applied' || result.kind === 'queued') feedback.emit('success');
    else feedback.emit('error');
  }

  return (
    <QuestsView
      crewName={crewName}
      guide={guide}
      model={model}
      offline={syncPhase === 'offline'}
      reveals={reveals.quests}
      befriendPlace={befriendPlace}
      onSignUp={(questId) => void onSignUp(questId)}
      onPractise={onPractise}
    />
  );
}
