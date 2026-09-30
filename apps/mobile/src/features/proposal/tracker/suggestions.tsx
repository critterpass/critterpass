/**
 * {GUIDE} SUGGESTS (3f-6): the open suggestions the worker made for the organiser, in the guide's
 * words (a resend at the recipient's evening hour with a lead item, an offer everyone can take
 * without naming who asked). RESEND or OFFER acts; dismissing hides it. A handled card leaves.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { t } from '@lingui/core/macro';
import { View } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { GUIDE_STICKERS } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import type { GuideId } from '@/ui/people/GuideLine';
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
  grow: { flex: 1 },
  divider: { height: 1, backgroundColor: th.semantic.text.onAccent, opacity: 0.2 },
}));

export function Suggestions({ proposalId, guide }: { proposalId: string; guide: GuideId }) {
  const styles = useStyles();
  const theme = useTheme();
  const { rows } = useLiveRows<{ id: string; kind: string; copy: string }>(
    SQL,
    [proposalId],
    ['rsvp_suggestions'],
  );
  const execute = useCommand(executeSuggestionCommand);
  const dismiss = useCommand(dismissSuggestionCommand);
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
              <TextLink
                label={t({ id: 'proposal.suggest.dismiss', message: 'Not now' })}
                onPress={() => void dismiss.send({ suggestion_id: row.id })}
                testID={`suggestion-dismiss-${index}`}
              />
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
              onPress={() => void execute.send({ suggestion_id: row.id })}
              testID={`suggestion-act-${index}`}
            />
          </View>
        </View>
      ))}
    </View>
  );
}
