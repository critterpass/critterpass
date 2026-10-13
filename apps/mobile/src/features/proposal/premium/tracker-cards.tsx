/**
 * The tracker's cards (undesigned in the premium set; built from the kit's card, sticker and
 * buttons): the guide's suggestions with their action and "Not now", and the locked-in card ("The
 * trip is on", who is going, the way into the plan).
 */
import { useLingui } from '@lingui/react/macro';
import { View } from 'react-native';

import { guideSticker, type GuideStickerId } from '@/ui/avatar/guides';
import { Button, Card, CritterSticker, Text, TextButton, usePremiumTheme } from '@/ui/premium';

import { useSuggestions, type SuggestionRow } from '../tracker/use-suggestions';

export function PremiumSuggestionsView(props: {
  readonly rows: readonly SuggestionRow[];
  readonly guide: GuideStickerId;
  readonly onAct: (id: string) => void;
  readonly onDismiss: (id: string) => void;
}) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  if (props.rows.length === 0) return null;
  const info = guideSticker(props.guide);
  return (
    <Card testID="tracker-suggestions">
      <View style={{ gap: theme.space.gap12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap8 }}>
          <CritterSticker kind={info.kind} name={info.name} size={36} />
          <Text variant="headline">
            {t({ id: 'proposal.suggest.title', message: `${info.name} suggests` })}
          </Text>
        </View>
        {props.rows.map((row, index) => (
          <View key={row.id} style={{ gap: theme.space.gap8 }}>
            <Text variant="rowText" tone="muted">
              {row.copy}
            </Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap12 }}>
              <Button
                size="medium"
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
              <TextButton
                label={t({ id: 'proposal.suggest.dismiss', message: 'Not now' })}
                onPress={() => props.onDismiss(row.id)}
                testID={`suggestion-dismiss-${index}`}
              />
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

export function PremiumSuggestions(props: {
  readonly proposalId: string;
  readonly guide: GuideStickerId;
}) {
  const suggestions = useSuggestions(props.proposalId);
  return (
    <PremiumSuggestionsView
      rows={suggestions.rows}
      guide={props.guide}
      onAct={suggestions.act}
      onDismiss={suggestions.dismiss}
    />
  );
}

export function PremiumConfirmedCard(props: {
  readonly guide: GuideStickerId;
  readonly going: number;
  /** "Lisbon · Nov 5–11". */
  readonly tripLine: string;
  /** Opens the plan; absent until the plan area offers it. */
  readonly onPlan: (() => void) | undefined;
}) {
  const theme = usePremiumTheme();
  const { t } = useLingui();
  const info = guideSticker(props.guide);
  const going = props.going;
  return (
    <Card testID="tracker-confirmed">
      <View style={{ gap: theme.space.gap12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap12 }}>
          <CritterSticker kind={info.kind} name={info.name} size={64} pose="cheer" />
          <View style={{ flex: 1, gap: theme.space.gap4 }}>
            <Text variant="title">
              {t({ id: 'proposal.confirmed.title', message: 'The trip is on' })}
            </Text>
            <Text variant="rowText" tone="muted">
              {props.tripLine}
            </Text>
            <Text variant="rowText" tone="muted">
              {t({ id: 'proposal.confirmed.going', message: `${going} going` })}
            </Text>
          </View>
        </View>
        {props.onPlan === undefined ? null : (
          <Button
            variant="secondary"
            label={t({ id: 'proposal.confirmed.plan', message: 'Open the plan' })}
            onPress={props.onPlan}
            testID="tracker-open-plan"
          />
        )}
      </View>
    </Card>
  );
}
