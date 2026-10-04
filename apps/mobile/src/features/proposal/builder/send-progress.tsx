/**
 * After SEND (3f-1, generating state): each recipient's avatar stamps as the guide finishes their
 * version; one the guide couldn't write gets the crew's shared version and says so. The crew can
 * already open it; WHO'S IN? goes to the tracker.
 */
import type { ProposalFormat } from '@cp/domain';
import { t } from '@lingui/core/macro';
import { ScrollView, View } from 'react-native';

import { guideSticker, type GuideStickerId } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { Icon } from '@/ui/icons/Icon';
import { Avatar } from '@/ui/people/Avatar';
import { Sticker } from '@/ui/sticker/Sticker';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { CrewPerson } from '../data/trip';
import type { ProposalVersion } from '../data/proposal';
import { FormatThumb } from './format-cards';

const useStyles = makeStyles((th) => ({
  content: { padding: th.space['20'], gap: th.space['16'], flexGrow: 1 },
  list: {
    backgroundColor: th.semantic.bg.raised,
    borderRadius: th.radius.lg,
    paddingVertical: th.space['4'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: th.space['12'],
    paddingHorizontal: th.space['14'],
    paddingVertical: th.space['10'],
  },
  grow: { flex: 1 },
  sentRow: { flexDirection: 'row', alignItems: 'flex-end', gap: th.space['16'] },
  footer: { paddingHorizontal: th.space['20'], paddingBottom: th.space['8'] },
}));

export interface SendProgressProps {
  readonly guide: GuideStickerId;
  /** What went out, as the builder drew it. */
  readonly format: ProposalFormat;
  readonly destination: string;
  readonly headline: string;
  readonly price: string | null;
  readonly guideName: string;
  readonly recipients: readonly CrewPerson[];
  readonly versions: readonly ProposalVersion[];
  readonly onTracker: () => void;
}

export function SendProgress(props: SendProgressProps) {
  const styles = useStyles();
  const theme = useTheme();
  const info = guideSticker(props.guide);
  const byUid = new Map(props.versions.map((v) => [v.recipientId, v]));
  const done = props.versions.filter((v) => v.status !== 'pending').length;
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="proposal-sent">
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.sentRow}>
          <FormatThumb
            format={props.format}
            guide={props.guide}
            destination={props.destination}
            headline={props.headline}
            price={props.price}
          />
          <Sticker kind={info.kind} name={info.name} size={112} />
        </View>
        <Text variant="h1" accessibilityRole="header">
          {t({ id: 'proposal.sent.title', message: 'It’s on its way' })}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {done < props.versions.length
            ? t({
                id: 'proposal.sent.writing',
                message: `${props.guideName} is finishing each version. The crew can open it already.`,
              })
            : t({ id: 'proposal.sent.done', message: 'Every version is written and sent.' })}
        </Text>
        <View style={styles.list}>
          {props.recipients.map((person) => {
            const version = byUid.get(person.uid);
            const ready = version !== undefined && version.status !== 'pending';
            return (
              <View key={person.uid} style={styles.row} testID={`sent-${person.uid}`}>
                <Avatar name={person.name} joinIndex={person.joinIndex} size="md" decorative />
                <View style={styles.grow}>
                  <Text variant="rowTitle">{person.name}</Text>
                  <Text variant="caption" color={theme.semantic.text.secondary}>
                    {version?.fallbackNote ??
                      (ready
                        ? t({
                            id: 'proposal.sent.readyFor',
                            message: `${person.name}'s version is ready`,
                          })
                        : t({
                            id: 'proposal.sent.pendingFor',
                            message: `${props.guideName} is writing ${person.name}'s version`,
                          }))}
                  </Text>
                </View>
                {ready ? (
                  <Icon
                    name="check"
                    size={20}
                    color={theme.semantic.state.success}
                    label={t({ id: 'proposal.sent.stamped', message: 'Sent' })}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      </ScrollView>
      <View style={styles.footer}>
        <PillButton
          label={t({ id: 'proposal.sent.tracker', message: 'Who’s in?' })}
          onPress={props.onTracker}
          testID="sent-tracker"
        />
      </View>
    </Scaffold>
  );
}
