/**
 * A redraft (3c-12) as a pure view. First the guide thinks (at least a short beat, however fast
 * the job), then everything folds into "DAY {n}, REDRAFTED": the summary, the changes ticking in
 * one by one, the measured effect, KEEP IT and "Put {old day} back". A redraft that could not beat
 * the day or failed says so (it did not count); one already kept or put back says that too.
 */
import { t } from '@lingui/core/macro';
import { ScrollView, View } from 'react-native';

import { guideColour, guideSticker } from '@/ui/avatar/guides';
import { TypingDots } from '@/ui/chat/TypingDots';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Icon } from '@/ui/icons/Icon';
import type { GuideId } from '@/ui/people/GuideLine';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { HeaderPill } from '@/ui/shell/HeaderPills';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { Fold } from '@/ui/transitions/Fold';
import { makeStyles, useTheme } from '@/ui/theme';

import type { ChangeCard as ChangeCardModel, MetricChip } from '../data/redraft';
import { ChangeCard } from './change-card';
import { MetricChips } from './metric-chips';

const STICKER = 84;
const THINKING = 150;

export type DiffPhase = 'thinking' | 'ready' | 'identical' | 'failed' | 'settled';

const useStyles = makeStyles((th) => ({
  header: {
    paddingHorizontal: th.space['20'],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: th.space['32'] + th.space['12'],
  },
  content: {
    paddingHorizontal: th.space['20'],
    paddingBottom: th.space['16'],
    gap: th.space['12'],
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: th.space['12'] },
  grow: { flex: 1 },
  centre: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: th.space['12'],
    paddingHorizontal: th.space['20'],
  },
  centred: { textAlign: 'center' },
  footer: {
    paddingHorizontal: th.space['20'],
    paddingTop: th.space['8'],
    gap: th.space['8'],
    alignItems: 'center',
  },
}));

export interface RedraftDiffViewProps {
  readonly guide: GuideId;
  readonly locale: string;
  readonly tz: string;
  readonly phase: DiffPhase;
  readonly dayNo: number | null;
  readonly summary: string | null;
  readonly cards: readonly ChangeCardModel[];
  readonly chips: readonly MetricChip[];
  readonly off: ReadonlySet<string>;
  readonly baseTitle: string | null;
  readonly sending: boolean;
  readonly onToggle: (key: string) => void;
  readonly onKeep: () => void;
  readonly onPutBack: () => void;
  readonly onBack: () => void;
  readonly onBoost: (() => void) | undefined;
}

function Thinking({ guide, dayNo }: { readonly guide: GuideId; readonly dayNo: number | null }) {
  const styles = useStyles();
  const info = guideSticker(guide);
  const guideName = info.name;
  const n = dayNo ?? 0;
  return (
    <View style={styles.centre} testID="redraft-thinking">
      <Sticker kind={info.kind} name={info.name} pose="think" size={THINKING} />
      <Text variant="h2" style={styles.centred} accessibilityLiveRegion="polite">
        {dayNo === null
          ? t({ id: 'planDraft.diff.thinkingAny', message: `${guideName} is redrafting` })
          : t({ id: 'planDraft.diff.thinking', message: `${guideName} is redrafting day ${n}` })}
      </Text>
      <TypingDots color={guideColour(guide)} />
    </View>
  );
}

function Outcome({
  guide,
  title,
  line,
  onBack,
}: {
  readonly guide: GuideId;
  readonly title: string;
  readonly line: string;
  readonly onBack: () => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const info = guideSticker(guide);
  return (
    <View style={styles.centre} testID="redraft-outcome">
      <Sticker kind={info.kind} name={info.name} pose="think" size={THINKING} />
      <Text variant="h2" style={styles.centred}>
        {title}
      </Text>
      <Text variant="body" color={theme.semantic.text.secondary} style={styles.centred}>
        {line}
      </Text>
      <PillButton
        label={t({ id: 'planDraft.diff.back', message: 'Back to the draft' })}
        onPress={onBack}
        testID="redraft-outcome-back"
      />
    </View>
  );
}

export function RedraftDiffView(props: RedraftDiffViewProps) {
  const { guide, phase, dayNo } = props;
  const styles = useStyles();
  const theme = useTheme();
  const info = guideSticker(guide);
  const guideName = info.name;
  const n = dayNo ?? 0;
  const old = props.baseTitle ?? '';
  const header = (
    <View style={styles.header}>
      <BackEyebrow
        label={t({ id: 'planDraft.diff.backEyebrow', message: `${guideName}’s draft` })}
        onPress={props.onBack}
        testID="redraft-back"
      />
      <HeaderPill
        tone="private"
        label={t({ id: 'planDraft.onlyYou', message: 'Only you see this' })}
        icon={<Icon name="lock" size={14} decorative color={theme.semantic.text.secondary} />}
      />
    </View>
  );
  let body;
  if (phase === 'thinking') body = <Thinking guide={guide} dayNo={dayNo} />;
  else if (phase === 'identical') {
    body = (
      <Outcome
        guide={guide}
        title={t({ id: 'planDraft.diff.identicalTitle', message: 'Couldn’t beat this day' })}
        line={t({
          id: 'planDraft.diff.identical',
          message: `Day ${n} is already the best I can do. That one didn’t count.`,
        })}
        onBack={props.onBack}
      />
    );
  } else if (phase === 'failed') {
    body = (
      <Outcome
        guide={guide}
        title={t({ id: 'planDraft.diff.failedTitle', message: 'That redraft didn’t work' })}
        line={t({
          id: 'planDraft.diff.failed',
          message: 'It didn’t count. Try again, maybe with another reason.',
        })}
        onBack={props.onBack}
      />
    );
  } else if (phase === 'settled') {
    body = (
      <Outcome
        guide={guide}
        title={t({ id: 'planDraft.diff.settledTitle', message: 'Already sorted' })}
        line={t({
          id: 'planDraft.diff.settled',
          message: 'You’ve kept or put back this redraft already.',
        })}
        onBack={props.onBack}
      />
    );
  } else {
    const kept = props.cards.some((card) => !props.off.has(card.key));
    body = (
      <Fold testID="redraft-diff">
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.titleRow}>
            <Sticker kind={info.kind} name={info.name} pose="cheer" size={STICKER} />
            <View style={styles.grow}>
              <Text variant="h1" accessibilityRole="header">
                {t({ id: 'planDraft.diff.title', message: `Day ${n}, redrafted` })}
              </Text>
            </View>
          </View>
          {props.summary === null ? null : (
            <Text variant="body" color={theme.semantic.text.secondary}>
              {props.summary}
            </Text>
          )}
          {props.cards.map((card, index) => (
            <ChangeCard
              key={card.key}
              card={card}
              index={index}
              kept={!props.off.has(card.key)}
              locale={props.locale}
              tz={props.tz}
              onToggle={() => props.onToggle(card.key)}
            />
          ))}
          <MetricChips chips={props.chips} locale={props.locale} />
        </ScrollView>
        <View style={styles.footer}>
          <PillButton
            label={t({ id: 'planDraft.diff.keep', message: 'Keep it' })}
            onPress={props.onKeep}
            disabled={!kept}
            loading={props.sending}
            sheen
            testID="redraft-keep"
          />
          <TextLink
            label={
              old === ''
                ? t({ id: 'planDraft.diff.putBackDay', message: 'Put the day back' })
                : t({ id: 'planDraft.diff.putBack', message: `Put ${old} back` })
            }
            onPress={props.onPutBack}
            testID="redraft-put-back"
          />
          {props.onBoost === undefined ? null : (
            <TextLink
              label={t({ id: 'planDraft.spent.boost', message: 'Boost for unlimited redrafts' })}
              onPress={props.onBoost}
              testID="redraft-boost"
            />
          )}
        </View>
      </Fold>
    );
  }
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="redraft-screen">
      {header}
      {body}
    </Scaffold>
  );
}
