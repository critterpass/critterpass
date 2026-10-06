/**
 * Phrase practice: the phrase to say (its card plays it first), the way to answer (say it and have
 * it checked, or "I said it"), what the phone heard with the verdict or the guide's one tip, and
 * the trip's phrases in two lists, practising and learned. Checking how it was said is a switch,
 * off until turned on; turning it on asks for the voice consent when it does not stand yet.
 */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { upper } from '@cp/i18n';

import { Row, Scaffold, Stack, Text, makeStyles, useTheme } from '@/ui';
import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { SegmentedProgress } from '@/ui/data/SegmentedProgress';
import { Toggle } from '@/ui/inputs/Toggle';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';

import { PracticeFeedback } from './practice-feedback';
import type { PracticeLists, PracticePhrase, PracticeState } from './practice-model';

export interface PracticeViewProps {
  readonly guideName: string;
  readonly lists: PracticeLists;
  /** The phrase being practised; null when the trip has no phrases yet. */
  readonly current: PracticePhrase | null;
  /** The current phrase's card, with its play button. */
  readonly card: ReactNode;
  readonly state: PracticeState;
  /** The pronunciation check is on. */
  readonly checking: boolean;
  /** The check was turned on without the voice consent: the question shows under the switch. */
  readonly consent: {
    readonly onAgree: () => void;
    readonly onNotNow: () => void;
    /** The yes is on its way to the server, or waiting for a connection to go. */
    readonly pending?: 'sending' | 'needs_connection' | null;
  } | null;
  readonly onChecking: (on: boolean) => void;
  readonly onPick: (id: string) => void;
  readonly onListen: () => void;
  readonly onCheck: () => void;
  readonly onSaid: () => void;
  readonly onNext: () => void;
  readonly onOpenSettings?: () => void;
}

const useStyles = makeStyles((t) => ({
  body: {
    paddingHorizontal: t.size.gutter,
    paddingTop: t.space['12'],
    paddingBottom: t.space['32'],
    gap: t.space['24'],
  },
  row: {
    paddingVertical: t.space['12'],
    borderBottomWidth: 1,
    borderBottomColor: t.semantic.border.decorative,
    gap: t.space['2'],
  },
  toggle: { flex: 1 },
}));

function PhraseRow({
  phrase,
  current,
  onPick,
}: {
  readonly phrase: PracticePhrase;
  readonly current: boolean;
  readonly onPick: (id: string) => void;
}) {
  const styles = useStyles();
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: current }}
      accessibilityLabel={`${phrase.text}, ${phrase.gloss}`}
      onPress={() => onPick(phrase.id)}
      style={styles.row}
      testID={`guide-practice-row-${phrase.id}`}
    >
      <Text
        variant="label"
        accessibilityLanguage={phrase.language}
        {...(current ? { color: theme.color.yellow } : {})}
      >
        {phrase.text}
      </Text>
      <Text variant="bodySm" color={theme.semantic.text.secondary}>
        {phrase.gloss}
      </Text>
    </Pressable>
  );
}

export function PracticeView(props: PracticeViewProps) {
  const { state, lists, current } = props;
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const total = lists.practising.length + lists.learned.length;
  const learned = lists.learned.length;
  const busy = state.phase === 'checking';
  const canListen = props.checking && props.consent === null && state.issue !== 'mic_denied';

  return (
    <Scaffold edges={['top', 'bottom']} testID="guide-practice">
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Stack gap="8">
          <BackEyebrow label={props.guideName} testID="guide-practice-back" />
          <Text variant="h1" singleLine={false}>
            {upper(t({ id: 'guide.practice.title', message: 'Say it out loud' }), i18n.locale)}
          </Text>
          {total === 0 ? null : (
            <Stack gap="6">
              <Text
                variant="bodySm"
                color={theme.semantic.text.secondary}
                testID="guide-practice-count"
              >
                {t({ id: 'guide.practice.count', message: `${learned} of ${total} learned` })}
              </Text>
              <SegmentedProgress total={total} done={learned} />
            </Stack>
          )}
        </Stack>

        {current === null ? (
          <Text variant="bodyLg" testID="guide-practice-empty">
            {t({
              id: 'guide.practice.empty',
              message: `No phrases for this trip yet. ${props.guideName} adds them as the plan fills in.`,
            })}
          </Text>
        ) : (
          <Stack gap="16">
            {props.card}
            {current.romanisation === null ? null : (
              <Text variant="bodySm" color={theme.semantic.text.secondary}>
                {current.romanisation}
              </Text>
            )}
            <PracticeFeedback
              guideName={props.guideName}
              language={current.language}
              state={state}
              onSaid={props.onSaid}
              {...(props.onOpenSettings ? { onOpenSettings: props.onOpenSettings } : {})}
            />
            {state.phase === 'ok' ? (
              <PillButton
                label={t({ id: 'guide.practice.next', message: 'Next phrase' })}
                onPress={props.onNext}
                testID="guide-practice-next"
              />
            ) : (
              <Stack gap="12">
                {canListen ? (
                  state.phase === 'listening' ? (
                    <PillButton
                      label={t({ id: 'guide.practice.check', message: 'Done, check it' })}
                      onPress={props.onCheck}
                      testID="guide-practice-check"
                    />
                  ) : (
                    <PillButton
                      label={
                        state.phase === 'retry'
                          ? t({ id: 'guide.practice.again', message: 'Say it again' })
                          : t({ id: 'guide.practice.say', message: 'Say it' })
                      }
                      onPress={props.onListen}
                      loading={busy}
                      disabled={busy}
                      testID="guide-practice-say"
                    />
                  )
                ) : null}
                <PillButton
                  variant={canListen ? 'secondary' : 'primary'}
                  label={t({ id: 'guide.practice.said', message: 'I said it' })}
                  onPress={props.onSaid}
                  disabled={busy}
                  testID="guide-practice-said"
                />
              </Stack>
            )}
          </Stack>
        )}

        <Stack gap="12">
          <Row gap="12" align="center">
            <Stack gap="2" style={styles.toggle}>
              <Text variant="label">
                {t({ id: 'guide.practice.checkToggle', message: 'Check how I say it' })}
              </Text>
              <Text variant="bodySm" color={theme.semantic.text.secondary}>
                {t({
                  id: 'guide.practice.checkCaption',
                  message: `Your phone listens, and ${props.guideName} gives one tip when a word needs work.`,
                })}
              </Text>
            </Stack>
            <Toggle
              value={props.checking}
              onValueChange={props.onChecking}
              label={t({ id: 'guide.practice.checkToggle', message: 'Check how I say it' })}
              testID="guide-practice-check-toggle"
            />
          </Row>
          {props.consent === null ? null : (
            <Card tone="paper" testID="guide-practice-consent">
              <Stack gap="12">
                <Text variant="h3" singleLine={false}>
                  {t({
                    id: 'guide.practice.consentTitle',
                    message: 'Let your phone listen?',
                  })}
                </Text>
                <Text variant="bodySm">
                  {t({
                    id: 'guide.practice.consentBody',
                    message:
                      'To check a phrase, what you say can be sent to a speech service to be written down. Only the words are compared with the card.',
                  })}
                </Text>
                {props.consent.pending !== 'needs_connection' ? null : (
                  <Text variant="bodySm" testID="guide-practice-consent-offline">
                    {t({
                      id: 'guide.voice.consentNeedsConnection',
                      message:
                        'Voice needs a connection. It turns on as soon as you are back online.',
                    })}
                  </Text>
                )}
                <Row gap="8">
                  <PillButton
                    size="sm"
                    label={t({ id: 'guide.voice.consentYes', message: 'Turn on voice' })}
                    loading={props.consent.pending != null}
                    onPress={props.consent.onAgree}
                    testID="guide-practice-consent-yes"
                  />
                  <PillButton
                    size="sm"
                    tone="ink"
                    label={t({ id: 'guide.dietary.notNow', message: 'Not now' })}
                    onPress={props.consent.onNotNow}
                    testID="guide-practice-consent-no"
                  />
                </Row>
              </Stack>
            </Card>
          )}
        </Stack>

        {lists.practising.length === 0 ? null : (
          <View testID="guide-practice-practising">
            <Text variant="eyebrow">
              {upper(t({ id: 'guide.practice.practising', message: 'Practising' }), i18n.locale)}
            </Text>
            {lists.practising.map((phrase) => (
              <PhraseRow
                key={phrase.id}
                phrase={phrase}
                current={phrase.id === current?.id}
                onPick={props.onPick}
              />
            ))}
          </View>
        )}
        {lists.learned.length === 0 ? null : (
          <View testID="guide-practice-learned">
            <Text variant="eyebrow">
              {upper(t({ id: 'guide.practice.learned', message: 'Learned' }), i18n.locale)}
            </Text>
            {lists.learned.map((phrase) => (
              <PhraseRow
                key={phrase.id}
                phrase={phrase}
                current={phrase.id === current?.id}
                onPick={props.onPick}
              />
            ))}
          </View>
        )}
      </ScrollView>
    </Scaffold>
  );
}
