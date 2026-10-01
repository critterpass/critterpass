/**
 * {GUIDE} SUGGESTS (3f-6): the open suggestions the worker made for the organiser, in the guide's
 * words (a resend at the recipient's evening hour with a lead item, an offer everyone can take
 * without naming who asked). RESEND or OFFER acts; dismissing hides it. A handled card leaves.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { t } from '@lingui/core/macro';
import { Pressable, View } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import type { GuideStickerId as GuideId } from '@/ui/avatar/guides';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { dismissSuggestionCommand, executeSuggestionCommand } from '../data/commands';
import { useLiveRows } from '../data/rows';

const SQL = `SELECT id, kind, copy FROM rsvp_suggestions
  WHERE proposal_id = ? AND status = 'open' ORDER BY created_at`;

const useStyles = makeStyles((th) => ({
  card: {
    backgroundColor: th.color.orange,
    borderRadius: th.radius.lg,
    padding: th.space['14'],
    gap: th.space['10'],
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: th.space['8'] },
  row: { flexDirection: 'row', alignItems: 'center', gap: th.space['10'] },
  grow: { flex: 1, gap: th.space['6'] },
  divider: { height: 1, backgroundColor: th.semantic.text.onAccent, opacity: 0.2 },
}));

export interface SuggestionRow {
  readonly id: string;
  readonly kind: string;
  readonly copy: string;
}

/** The suggestions card as a pure view (the lab draws it with fixed rows). */
export function SuggestionsView(props: {
  readonly rows: readonly SuggestionRow[];
  readonly guide: GuideId;
  readonly onAct: (id: string) => void;
  readonly onDismiss: (id: string) => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  const { rows, guide } = props;
  if (rows.length === 0) return null;
  const info = GUIDE_STICKERS[guide];
  const ink = theme.semantic.text.onAccent;
  return (
    <View style={styles.card} testID="tracker-suggestions">
      <View style={styles.head}>
        <Sticker kind={info.kind} name={info.name} size={36} />
        <Text variant="title" color={ink}>
          {t({ id: 'proposal.suggest.title', message: `${info.name} suggests` })}
        </Text>
      </View>
      {rows.map((row, index) => (
        <View key={row.id}>
          {index > 0 ? <View style={styles.divider} /> : null}
          <View style={styles.row}>
            <View style={styles.grow}>
              <Text variant="bodySm" color={ink}>
                {row.copy}
              </Text>
              <Pressable
                onPress={() => props.onDismiss(row.id)}
                accessibilityRole="button"
                hitSlop={8}
                testID={`suggestion-dismiss-${index}`}
              >
                <Text variant="label" color={ink}>
                  {t({ id: 'proposal.suggest.dismiss', message: 'Not now' })}
                </Text>
              </Pressable>
            </View>
            <PillButton
              size="sm"
              tone="ink"
              label={
                row.kind === 'offer'
                  ? t({ id: 'proposal.suggest.offer', message: 'Offer' })
                  : row.kind === 'resend'
                    ? t({ id: 'proposal.suggest.resend', message: 'Resend' })
                    : t({ id: 'proposal.suggest.nudge', message: 'Nudge' })
              }
              onPress={() => props.onAct(row.id)}
              testID={`suggestion-act-${index}`}
            />
          </View>
        </View>
      ))}
    </View>
  );
}

export function Suggestions({ proposalId, guide }: { proposalId: string; guide: GuideId }) {
  const { rows } = useLiveRows<SuggestionRow>(SQL, [proposalId], ['rsvp_suggestions']);
  const execute = useCommand(executeSuggestionCommand);
  const dismiss = useCommand(dismissSuggestionCommand);
  return (
    <SuggestionsView
      rows={rows}
      guide={guide}
      onAct={(id) => void execute.send({ suggestion_id: id })}
      onDismiss={(id) => void dismiss.send({ suggestion_id: id })}
    />
  );
}
