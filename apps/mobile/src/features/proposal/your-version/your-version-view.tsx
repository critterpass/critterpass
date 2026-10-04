/**
 * YOUR VERSION (3f-3) as a pure view: "← PROPOSAL" with the free-cancel or reply-by chip,
 * "{NAME}, HERE'S YOUR VERSION", the picks, YOUR SHARE with the savings on offer, CREW HYPE, and
 * the three answers every proposal screen offers (I'M IN, MAYBE, I CAN'T MAKE IT) with ASK {GUIDE}
 * under them. Once answered it says so in place of the buttons, with the way to change it. A
 * reader who never told us what they want is not told the plan was built around their picks. The
 * organiser previewing someone's version sees it read-only; a version still being written and one
 * the guide couldn't personalise say so.
 */
import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import type { GuideStickerId as GuideId } from '@/ui/avatar/guides';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Sticker } from '@/ui/sticker/Sticker';
import { Skeleton } from '@/ui/states/Skeleton';
import { FooterFade, FOOTER_FADE_PT } from '@/ui/surface/FooterFade';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { Pick } from '../data/picks';
import { PicksList } from './picks-list';

const useStyles = makeStyles((th) => ({
  header: {
    paddingHorizontal: th.space['20'],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: th.space['32'] + th.space['12'],
  },
  chip: {
    backgroundColor: th.color.pink,
    borderRadius: th.radius.sm,
    paddingHorizontal: th.space['8'],
    paddingVertical: th.space['4'],
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: th.space['20'],
    paddingBottom: th.space['16'] + FOOTER_FADE_PT,
    gap: th.space['14'],
  },
  note: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    padding: th.space['12'],
  },
  footer: { paddingHorizontal: th.space['20'], paddingTop: th.space['8'], gap: th.space['10'] },
  row: { flexDirection: 'row', gap: th.space['10'] },
  grow: { flex: 1 },
  ask: { alignItems: 'center' },
}));

export interface YourVersionViewProps {
  readonly name: string;
  /** The crew's shared version: the plan's own highlights, with no claim about the reader. */
  readonly group: boolean;
  /** The reader has wishes on record (a must-do, taste answers): the plan may say it used them. */
  readonly personalised: boolean;
  /** The organiser's first name, for a reader the plan was not personalised for. */
  readonly organiser: string;
  /** "Lisbon · Nov 5–11". */
  readonly tripLine: string;
  /** Opens the whole plan, read-only for a member; absent until the plan area offers it. */
  readonly onPlan: (() => void) | undefined;
  /** The organiser reading someone else's version. */
  readonly preview: boolean;
  readonly guide: GuideId;
  readonly chip: string | null;
  readonly pending: boolean;
  readonly fallbackNote: string | null;
  readonly picks: readonly Pick[];
  readonly when: (pick: Pick) => string;
  readonly tag: (pick: Pick) => string;
  readonly share: ReactNode;
  readonly hype: ReactNode;
  /** The reader's standing answer; null while they have not answered. */
  readonly answer: 'in' | 'maybe' | 'out' | 'waitlisted' | null;
  readonly onBack: () => void;
  readonly onPick: (pick: Pick) => void;
  readonly onIn: () => void;
  readonly onMaybe: () => void;
  /** "I can't make it": asks first, since it frees the seat. */
  readonly onOut: () => void;
  readonly onAsk: () => void;
}

function answeredLine(answer: 'in' | 'out' | 'waitlisted'): string {
  switch (answer) {
    case 'in':
      return t({ id: 'proposal.version.youreIn', message: 'You’re in. See you there.' });
    case 'waitlisted':
      return t({ id: 'proposal.version.waitlisted', message: 'You’re on the waitlist.' });
    case 'out':
      return t({ id: 'proposal.version.out', message: 'You said you can’t make it.' });
  }
}

export function YourVersionView(props: YourVersionViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const info = GUIDE_STICKERS[props.guide];
  const name = props.name;
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="proposal-version">
      <View style={styles.header}>
        <BackEyebrow
          label={t({ id: 'proposal.version.back', message: 'Proposal' })}
          onPress={props.onBack}
          testID="version-back"
        />
        {props.chip === null ? null : (
          <View style={styles.chip}>
            <Text variant="label" color={theme.semantic.text.onAccent} testID="version-chip">
              {props.chip}
            </Text>
          </View>
        )}
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {props.tripLine === '' ? null : (
          <Text variant="eyebrow" testID="version-trip">
            {props.tripLine}
          </Text>
        )}
        <Text variant="h1" accessibilityRole="header" testID="version-title">
          {props.preview
            ? t({ id: 'proposal.version.titlePreview', message: `${name}’s version` })
            : props.group || !props.personalised
              ? t({ id: 'proposal.version.titleGroup', message: `${name}, here’s the plan` })
              : t({ id: 'proposal.version.title', message: `${name}, here’s your version` })}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {props.group
            ? t({
                id: 'proposal.version.subGroup',
                message: `${info.name} wrote one plan for the whole crew. Tap a stop to open it.`,
              })
            : props.personalised
              ? t({
                  id: 'proposal.version.sub',
                  message: `${info.name} rebuilt the plan around what you picked. Tap anything to see why it’s there.`,
                })
              : props.organiser === ''
                ? t({
                    id: 'proposal.version.subPlainNoName',
                    message: `Here is the plan ${info.name} put together for the crew. Tap anything to see why it’s there.`,
                  })
                : t({
                    id: 'proposal.version.subPlain',
                    message: `Here is the plan ${props.organiser} and ${info.name} put together. Tap anything to see why it’s there.`,
                  })}
        </Text>
        {props.fallbackNote === null ? null : (
          <View style={styles.note}>
            <Text variant="bodySm" color={theme.semantic.text.secondary}>
              {props.fallbackNote}
            </Text>
          </View>
        )}
        {props.pending ? (
          <>
            <Sticker kind={info.kind} name={info.name} size={72} />
            <Text variant="bodySm" color={theme.semantic.text.secondary} testID="version-pending">
              {t({
                id: 'proposal.version.pending',
                message: `${info.name} is still writing this version. It lands here in a moment.`,
              })}
            </Text>
            <Skeleton preset="card" />
          </>
        ) : (
          <PicksList picks={props.picks} when={props.when} tag={props.tag} onOpen={props.onPick} />
        )}
        {props.onPlan === undefined || props.pending ? null : (
          <TextLink
            label={t({ id: 'proposal.version.wholePlan', message: 'See the whole plan' })}
            onPress={props.onPlan}
            testID="version-whole-plan"
          />
        )}
        {props.share}
        {props.hype}
      </ScrollView>
      <FooterFade />
      {props.preview ? null : (
        <View style={styles.footer}>
          {props.answer === null || props.answer === 'maybe' ? (
            <>
              {props.answer === 'maybe' ? (
                <Text
                  variant="bodySm"
                  color={theme.semantic.text.secondary}
                  testID="version-maybe-said"
                >
                  {t({
                    id: 'proposal.version.saidMaybe',
                    message: 'You said maybe. Say yes or no when you know.',
                  })}
                </Text>
              ) : null}
              <PillButton
                label={t({ id: 'proposal.version.in', message: 'I’m in' })}
                onPress={props.onIn}
                sheen
                testID="version-in"
              />
              <View style={styles.row}>
                {props.answer === 'maybe' ? null : (
                  <View style={styles.grow}>
                    <PillButton
                      size="sm"
                      variant="secondary"
                      label={t({ id: 'proposal.version.maybe', message: 'Maybe' })}
                      onPress={props.onMaybe}
                      testID="version-maybe"
                    />
                  </View>
                )}
                <View style={styles.grow}>
                  <PillButton
                    size="sm"
                    variant="secondary"
                    label={t({ id: 'proposal.version.cant', message: 'I can’t make it' })}
                    onPress={props.onOut}
                    testID="version-cant"
                  />
                </View>
              </View>
              <View style={styles.ask}>
                <TextLink
                  label={t({
                    id: 'proposal.version.askFirst',
                    message: `Not sure? Ask ${info.name}`,
                  })}
                  onPress={props.onAsk}
                  testID="version-ask"
                />
              </View>
            </>
          ) : (
            <View style={styles.grow}>
              <Text variant="title" color={theme.semantic.state.success} testID="version-answered">
                {answeredLine(props.answer)}
              </Text>
              {props.answer === 'in' ? (
                <TextLink
                  label={t({
                    id: 'proposal.version.out.cta',
                    message: 'I can’t make it after all',
                  })}
                  onPress={props.onOut}
                  testID="version-out"
                />
              ) : props.answer === 'out' ? (
                <TextLink
                  label={t({ id: 'proposal.version.inAfterAll', message: 'I’m in after all' })}
                  onPress={props.onIn}
                  testID="version-in-after-all"
                />
              ) : null}
            </View>
          )}
        </View>
      )}
    </Scaffold>
  );
}
