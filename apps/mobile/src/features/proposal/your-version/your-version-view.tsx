/**
 * YOUR VERSION (3f-3) as a pure view: "← PROPOSAL" with the free-cancel or reply-by chip,
 * "{NAME}, HERE'S YOUR VERSION", the picks, YOUR SHARE with the savings on offer, CREW HYPE, and
 * I'M IN / ASK {GUIDE}. The organiser previewing someone's version sees it read-only; a version
 * still being written, one the guide couldn't personalise, and an answered proposal say so.
 */
import { t } from '@lingui/core/macro';
import type { ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { guideSticker } from '@/ui/avatar/guides';
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
  footer: {
    paddingHorizontal: th.space['20'],
    paddingTop: th.space['8'],
    flexDirection: 'row',
    gap: th.space['10'],
  },
  grow: { flex: 1 },
}));

export interface YourVersionViewProps {
  readonly name: string;
  /** The crew's shared version: the plan's own highlights, with no claim about the reader. */
  readonly group: boolean;
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
  readonly share: ReactNode;
  readonly hype: ReactNode;
  /** "You're in" once answered, or null while the member can still answer. */
  readonly answered: string | null;
  readonly onBack: () => void;
  readonly onPick: (pick: Pick) => void;
  readonly onIn: () => void;
  readonly onAsk: () => void;
  /** "I can't make it" under an IN answer; null when there is no way out to offer. */
  readonly onOut: (() => void) | null;
}

export function YourVersionView(props: YourVersionViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const info = guideSticker(props.guide);
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
            : props.group
              ? t({ id: 'proposal.version.titleGroup', message: `${name}, here’s the plan` })
              : t({ id: 'proposal.version.title', message: `${name}, here’s your version` })}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {props.group
            ? t({
                id: 'proposal.version.subGroup',
                message: `${info.name} wrote one plan for the whole crew. Tap a stop to open it.`,
              })
            : t({
                id: 'proposal.version.sub',
                message: `${info.name} rebuilt the plan around what you picked. Tap anything to see why it’s there.`,
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
          <PicksList picks={props.picks} when={props.when} onOpen={props.onPick} />
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
          {props.answered === null ? (
            <>
              <View style={styles.grow}>
                <PillButton
                  label={t({ id: 'proposal.version.in', message: 'I’m in' })}
                  onPress={props.onIn}
                  sheen
                  testID="version-in"
                />
              </View>
              <View style={styles.grow}>
                <PillButton
                  variant="secondary"
                  label={t({ id: 'proposal.version.ask', message: `Ask ${info.name}` })}
                  onPress={props.onAsk}
                  testID="version-ask"
                />
              </View>
            </>
          ) : (
            <View style={styles.grow}>
              <Text variant="title" color={theme.semantic.state.success} testID="version-answered">
                {props.answered}
              </Text>
              {props.onOut === null ? null : (
                <TextLink
                  label={t({
                    id: 'proposal.version.out.cta',
                    message: 'I can’t make it after all',
                  })}
                  onPress={props.onOut}
                  testID="version-out"
                />
              )}
            </View>
          )}
        </View>
      )}
    </Scaffold>
  );
}
