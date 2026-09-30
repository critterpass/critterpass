/**
 * The proposal builder (3f-1) as a pure view: "← {PLACE} PLAN" and READY TO SEND, PITCH IT TO THE
 * CREW, the three formats, the cost and personal-version toggles, reply-by, the truthful stay rows
 * (a booked stay's free cancellation from the member's own confirmation, never a hold we placed),
 * PREVIEW AS {name} per written version, and SEND TO {n} FRIENDS with the reason when it can't.
 */
import type { ProposalFormat } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { ScrollView, View } from 'react-native';

import { QuickActionChip } from '@/ui/chips/QuickActionChip';
import { PillButton } from '@/ui/buttons/PillButton';
import { SettingsGroup, type SettingsRow } from '@/ui/inputs/SettingsGroup';
import type { GuideId } from '@/ui/people/GuideLine';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { OfflinePill } from '@/ui/states/OfflinePill';
import { FooterFade, FOOTER_FADE_PT } from '@/ui/surface/FooterFade';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { FormatCards } from './format-cards';
import type { BuilderConfig } from './model';

const useStyles = makeStyles((th) => ({
  header: {
    paddingHorizontal: th.space['20'],
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: th.space['32'] + th.space['12'],
  },
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: th.space['20'],
    paddingBottom: th.space['16'] + FOOTER_FADE_PT,
    gap: th.space['16'],
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: th.space['8'] },
  footer: { paddingHorizontal: th.space['20'], paddingTop: th.space['8'], gap: th.space['8'] },
}));

export interface StayRow {
  readonly key: string;
  readonly title: string;
  readonly freeCancelUntil: string | null;
}

export interface BuilderViewProps {
  readonly guideName: string;
  readonly guide: GuideId;
  readonly destination: string;
  readonly config: BuilderConfig;
  readonly headline: string;
  /** "$1,310 each", or null before the trip is priced. */
  readonly price: string | null;
  readonly replyByLabel: string;
  readonly stays: readonly StayRow[];
  /** Recipients whose version is written, for PREVIEW AS. */
  readonly previews: readonly { readonly uid: string; readonly name: string }[];
  readonly recipients: number;
  readonly offline: boolean;
  /** Why SEND is off, or null when it can go. */
  readonly blocked: string | null;
  readonly sending: boolean;
  readonly onBack: () => void;
  readonly onFormat: (format: ProposalFormat) => void;
  readonly onShowCost: (on: boolean) => void;
  readonly onPersonal: (on: boolean) => void;
  readonly onReplyBy: () => void;
  readonly onPreview: (uid: string) => void;
  readonly onSend: () => void;
}

export function BuilderView(props: BuilderViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { config, guideName } = props;
  const n = props.recipients;
  const rows: SettingsRow[] = [
    {
      key: 'cost',
      kind: 'toggle',
      title: t({ id: 'proposal.build.showCost', message: 'Show cost per person' }),
      ...(props.price === null ? {} : { subtitle: props.price }),
      value: config.showCost,
      onChange: props.onShowCost,
    },
    {
      key: 'personal',
      kind: 'toggle',
      title: t({ id: 'proposal.build.personal', message: 'Personal versions' }),
      subtitle: config.personal
        ? t({
            id: 'proposal.build.personalOn',
            message: `One for each of the ${n}, written by ${guideName}`,
          })
        : t({ id: 'proposal.build.personalOff', message: 'One version for the whole crew' }),
      value: config.personal,
      onChange: props.onPersonal,
    },
    {
      key: 'reply',
      kind: 'value',
      title: t({ id: 'proposal.build.replyBy', message: 'Reply by' }),
      value: props.replyByLabel,
      onPress: props.onReplyBy,
    },
    ...(props.stays.length === 0
      ? [
          {
            key: 'no-stay',
            kind: 'custom' as const,
            title: t({ id: 'proposal.build.noStay', message: 'Stays not booked yet' }),
            subtitle: t({
              id: 'proposal.build.noStaySub',
              message: 'Book once the crew agrees. Nothing is held for you.',
            }),
            trailing: null,
          },
        ]
      : props.stays.map((stay): SettingsRow => ({
          key: stay.key,
          kind: 'custom',
          title: stay.title,
          subtitle:
            stay.freeCancelUntil === null
              ? t({ id: 'proposal.build.stayNoCancel', message: 'Booked · no free cancellation' })
              : t({
                  id: 'proposal.build.stayCancel',
                  message: `Free cancellation until ${stay.freeCancelUntil}`,
                }),
          trailing: null,
        }))),
  ];
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="proposal-build">
      <View style={styles.header}>
        <BackEyebrow
          label={t({ id: 'proposal.build.back', message: `${props.destination} plan` })}
          onPress={props.onBack}
          testID="build-back"
        />
        <Text variant="eyebrow" color={theme.semantic.state.success}>
          {t({ id: 'proposal.build.ready', message: 'Ready to send' })}
        </Text>
      </View>
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text variant="h1" accessibilityRole="header" testID="build-title">
          {t({ id: 'proposal.build.title', message: 'Pitch it to the crew' })}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {config.personal
            ? t({
                id: 'proposal.build.sub',
                message: `${guideName} wrote a version for each person. Pick how it arrives.`,
              })
            : t({
                id: 'proposal.build.subShared',
                message: `${guideName} wrote one version for everyone. Pick how it arrives.`,
              })}
        </Text>
        {props.offline ? <OfflinePill /> : null}
        <FormatCards
          value={config.format}
          onChange={props.onFormat}
          guide={props.guide}
          destination={props.destination}
          headline={props.headline}
          price={config.showCost ? props.price : null}
        />
        <SettingsGroup rows={rows} testID="build-settings" />
        {props.previews.length === 0 ? null : (
          <View style={styles.chips}>
            {props.previews.map((p) => (
              <QuickActionChip
                key={p.uid}
                label={t({ id: 'proposal.build.previewAs', message: `Preview as ${p.name}` })}
                onPress={() => props.onPreview(p.uid)}
                testID={`build-preview-${p.uid}`}
              />
            ))}
          </View>
        )}
      </ScrollView>
      <FooterFade />
      <View style={styles.footer}>
        {props.blocked === null ? null : (
          <Text variant="caption" color={theme.semantic.text.secondary} testID="build-blocked">
            {props.blocked}
          </Text>
        )}
        <PillButton
          label={
            n === 1
              ? t({ id: 'proposal.build.sendOne', message: 'Send to 1 friend' })
              : t({ id: 'proposal.build.send', message: `Send to ${n} friends` })
          }
          onPress={props.onSend}
          disabled={props.blocked !== null}
          loading={props.sending}
          sheen
          testID="build-send"
        />
      </View>
    </Scaffold>
  );
}
