/**
 * The drafting screen (3c-8) as a pure view: the guide thinking in its rings, "{GUIDE} IS
 * DRAFTING YOUR {N} DAYS", the real job steps ticking off and the day cards streaming past. Around
 * it: slow (past 45 s, a push will follow), waiting for signal, a start the server refused, a
 * failed job (the failed step says why; nothing was spent) and a stopped one. When the job is done
 * everything folds away and `onDone` opens the draft.
 */
import { plural, t } from '@lingui/core/macro';
import { View } from 'react-native';

import { guideSticker } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import type { GuideId } from '@/ui/people/GuideLine';
import { OfflinePill } from '@/ui/states/OfflinePill';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { Fold } from '@/ui/transitions/Fold';
import { makeStyles, useTheme } from '@/ui/theme';

import { VISIBLE_STEP_IDS, type DayCard, type DraftPhase, type StepRow } from '../data/job';
import { DayMarquee } from './day-marquee';
import { GuideGlow, GuideInRings } from './ping-rings';
import { TaskList } from './task-list';

export interface DraftingViewProps {
  readonly guide: GuideId;
  readonly days: number;
  readonly phase: DraftPhase;
  readonly steps: readonly StepRow[];
  readonly dayCards: readonly DayCard[];
  /** The job is done and its result has been on screen long enough: fold away, then `onDone`. */
  readonly leaving: boolean;
  readonly onDone: () => void;
  readonly onRetry: () => void;
  readonly onCancel: () => void;
  readonly onBack: () => void;
  readonly testID?: string;
}

const useStyles = makeStyles((th) => ({
  body: { flex: 1, paddingHorizontal: th.space['20'], gap: th.space['12'] },
  head: { alignItems: 'center', gap: th.space['8'] },
  centred: { textAlign: 'center' },
  marquee: { marginHorizontal: -th.space['20'] },
  footer: {
    paddingHorizontal: th.space['20'],
    paddingBottom: th.space['8'],
    gap: th.space['8'],
    alignItems: 'center',
  },
}));

function titleFor(phase: DraftPhase, guideName: string, days: number): string {
  switch (phase.kind) {
    case 'failed':
      return t({ id: 'planDraft.drafting.failedTitle', message: `${guideName} couldn’t finish` });
    case 'cancelled':
      return t({ id: 'planDraft.drafting.stoppedTitle', message: 'Draft stopped' });
    case 'offline':
      return t({ id: 'planDraft.drafting.offlineTitle', message: 'Waiting for signal' });
    case 'blocked':
      return t({ id: 'planDraft.drafting.blockedTitle', message: 'Not quite ready' });
    case 'running':
    case 'starting':
    case 'done':
      return t({
        id: 'planDraft.drafting.title',
        message: plural(days, {
          one: `${guideName} is drafting your day`,
          other: `${guideName} is drafting your # days`,
        }),
      });
  }
}

function lineFor(phase: DraftPhase, days: number): string {
  switch (phase.kind) {
    case 'running':
      return phase.slow
        ? t({
            id: 'planDraft.drafting.slow',
            message: 'Taking a bit longer than usual. I’ll ping you when it’s ready.',
          })
        : t({
            id: 'planDraft.drafting.line',
            message: 'About 20 seconds. You review it before anyone else sees it.',
          });
    case 'offline':
      return t({
        id: 'planDraft.drafting.offline',
        message: plural(days, {
          one: 'I’ll start on your day as soon as you’re back online.',
          other: 'I’ll start on your # days as soon as you’re back online.',
        }),
      });
    case 'blocked':
      return phase.reason === 'dates_not_locked'
        ? t({ id: 'planDraft.drafting.noDates', message: 'Lock the dates first, then I’ll draft.' })
        : t({
            id: 'planDraft.drafting.blocked',
            message: 'I can’t start this draft yet. Finish setup and try again.',
          });
    case 'failed':
      return t({
        id: 'planDraft.drafting.failed',
        message: 'Nobody saw it and nothing was used up. Want me to try again?',
      });
    case 'cancelled':
      return t({
        id: 'planDraft.drafting.stopped',
        message: 'Nobody saw it. Start again whenever you like.',
      });
    case 'starting':
    case 'done':
      return t({
        id: 'planDraft.drafting.line',
        message: 'About 20 seconds. You review it before anyone else sees it.',
      });
  }
}

function Footer({
  phase,
  onRetry,
  onCancel,
  onBack,
}: Pick<DraftingViewProps, 'phase' | 'onRetry' | 'onCancel' | 'onBack'>) {
  const back = t({ id: 'planDraft.drafting.back', message: 'Back to setup' });
  switch (phase.kind) {
    case 'failed':
    case 'cancelled':
      return (
        <>
          <PillButton
            label={
              phase.kind === 'failed'
                ? t({ id: 'planDraft.drafting.retry', message: 'Try again' })
                : t({ id: 'planDraft.drafting.again', message: 'Draft again' })
            }
            onPress={onRetry}
            testID="drafting-retry"
          />
          <TextLink label={back} onPress={onBack} testID="drafting-back" />
        </>
      );
    case 'blocked':
      return <PillButton label={back} onPress={onBack} testID="drafting-back" />;
    case 'running':
    case 'starting':
      return (
        <TextLink
          label={t({ id: 'planDraft.drafting.cancel', message: 'Stop drafting' })}
          onPress={onCancel}
          testID="drafting-cancel"
        />
      );
    case 'offline':
    case 'done':
      return null;
  }
}

export function DraftingView({
  guide,
  days,
  phase,
  steps,
  dayCards,
  leaving,
  onDone,
  onRetry,
  onCancel,
  onBack,
  testID = 'drafting-screen',
}: DraftingViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const guideName = guideSticker(guide).name;
  const rows = steps.filter((row) => (VISIBLE_STEP_IDS as readonly string[]).includes(row.id));
  const working = phase.kind === 'running' || phase.kind === 'starting' || phase.kind === 'done';
  return (
    <Scaffold variant="scene" edges={['top', 'bottom']} background={<GuideGlow guide={guide} />}>
      <Fold leaving={leaving} onLeft={onDone} testID={testID}>
        <View style={styles.body}>
          <GuideInRings guide={guide} active={working} />
          <View style={styles.head}>
            {phase.kind === 'offline' ? <OfflinePill /> : null}
            <Text
              variant="h1"
              accessibilityRole="header"
              style={styles.centred}
              testID="drafting-title"
            >
              {titleFor(phase, guideName, days)}
            </Text>
            <Text
              variant="body"
              color={theme.semantic.text.secondary}
              style={styles.centred}
              accessibilityLiveRegion="polite"
              testID="drafting-line"
            >
              {lineFor(phase, days)}
            </Text>
          </View>
          {phase.kind === 'blocked' ? null : <TaskList rows={rows} />}
          {working ? (
            <View style={styles.marquee}>
              <DayMarquee days={dayCards} />
            </View>
          ) : null}
        </View>
        <View style={styles.footer}>
          <Footer phase={phase} onRetry={onRetry} onCancel={onCancel} onBack={onBack} />
        </View>
      </Fold>
    </Scaffold>
  );
}
