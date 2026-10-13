/**
 * Phrase practice in the premium look (undesigned; built from the phrase show mode and the kit):
 * a full screen with ✕, "Say it out loud" and the learned count on a bar, the phrase card, the way
 * to answer, the check-how-I-say-it switch with its consent card, and the trip's phrases as two
 * lists, practising and learned. A picked row is the phrase on the card.
 */
import { t } from '@lingui/core/macro';
import { Stack } from 'expo-router';
import { ScrollView, View } from 'react-native';
import Animated from 'react-native-reanimated';

import {
  Button,
  Card,
  EmptyState,
  ListCard,
  ProgressBar,
  Row,
  Text,
  Toggle,
  layoutTransition,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';
import { FullScreen, useScreenInsets } from '@/ui/premium/shell';

import type { PracticePhrase } from '../../practice/practice-model';
import type { PracticeViewProps } from '../../practice/practice-view';
import { PremiumPracticeFeedback } from './practice-feedback';

function PhraseList(props: {
  readonly title: string;
  readonly phrases: readonly PracticePhrase[];
  readonly currentId: string | null;
  readonly onPick: (id: string) => void;
  readonly testID: string;
}) {
  if (props.phrases.length === 0) return null;
  return (
    <View style={{ gap: 8 }} testID={props.testID}>
      <Text variant="tier" tone="muted" style={{ marginLeft: 6 }}>
        {props.title}
      </Text>
      <ListCard>
        {props.phrases.map((phrase) => (
          <Row
            key={phrase.id}
            title={phrase.text}
            subtitle={phrase.gloss}
            {...(phrase.id === props.currentId
              ? { trailingText: t({ id: 'guide.premium.practice.now', message: 'Now' }) }
              : {})}
            onPress={() => props.onPick(phrase.id)}
            testID={`guide-practice-row-${phrase.id}`}
          />
        ))}
      </ListCard>
    </View>
  );
}

function Answer(props: PracticeViewProps & { readonly canListen: boolean }) {
  const { state } = props;
  const busy = state.phase === 'checking';
  if (state.phase === 'ok') {
    return (
      <Button
        label={t({ id: 'guide.practice.next', message: 'Next phrase' })}
        onPress={props.onNext}
        testID="guide-practice-next"
      />
    );
  }
  return (
    <View style={{ gap: 10 }}>
      {!props.canListen ? null : state.phase === 'listening' ? (
        <Button
          icon="check"
          label={t({ id: 'guide.practice.check', message: 'Done, check it' })}
          onPress={props.onCheck}
          testID="guide-practice-check"
        />
      ) : (
        <Button
          icon="mic"
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
      )}
      <Button
        variant={props.canListen ? 'secondary' : 'primary'}
        label={t({ id: 'guide.practice.said', message: 'I said it' })}
        onPress={props.onSaid}
        disabled={busy}
        testID="guide-practice-said"
      />
    </View>
  );
}

function CheckSwitch(props: PracticeViewProps) {
  const label = t({ id: 'guide.practice.checkToggle', message: 'Check how I say it' });
  const consent = props.consent;
  return (
    <View style={{ gap: 10 }}>
      <Card padded style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="rowTitle">{label}</Text>
          <Text variant="captionMuted" singleLine={false}>
            {t({
              id: 'guide.practice.checkCaption',
              message: `Your phone listens, and ${props.guideName} gives one tip when a word needs work.`,
            })}
          </Text>
        </View>
        <Toggle
          value={props.checking}
          onChange={props.onChecking}
          accessibilityLabel={label}
          testID="guide-practice-check-toggle"
        />
      </Card>
      {consent === null ? null : (
        <Card padded style={{ gap: 10 }} testID="guide-practice-consent">
          <Text variant="headline" singleLine={false}>
            {t({ id: 'guide.practice.consentTitle', message: 'Let your phone listen?' })}
          </Text>
          <Text variant="rowText" tone="inkSecondary" singleLine={false}>
            {t({
              id: 'guide.practice.consentBody',
              message:
                'To check a phrase, what you say can be sent to a speech service to be written down. Only the words are compared with the card.',
            })}
          </Text>
          {consent.pending !== 'needs_connection' ? null : (
            <Text variant="captionMuted" singleLine={false} testID="guide-practice-consent-offline">
              {t({
                id: 'guide.voice.consentNeedsConnection',
                message: 'Voice needs a connection. It turns on as soon as you are back online.',
              })}
            </Text>
          )}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Button
                size="small"
                label={t({ id: 'guide.voice.consentYes', message: 'Turn on voice' })}
                loading={consent.pending != null}
                onPress={consent.onAgree}
                testID="guide-practice-consent-yes"
              />
            </View>
            <View style={{ flex: 1 }}>
              <Button
                size="small"
                variant="secondary"
                label={t({ id: 'guide.dietary.notNow', message: 'Not now' })}
                onPress={consent.onNotNow}
                testID="guide-practice-consent-no"
              />
            </View>
          </View>
        </Card>
      )}
    </View>
  );
}

export function PremiumPracticeView(props: PracticeViewProps) {
  const { state, lists, current } = props;
  const th = usePremiumTheme();
  const insets = useScreenInsets();
  const reduced = usePremiumReducedMotion();
  const total = lists.practising.length + lists.learned.length;
  const learned = lists.learned.length;
  const canListen = props.checking && props.consent === null && state.issue !== 'mic_denied';
  return (
    <FullScreen
      closeLabel={t({ id: 'guide.premium.practice.close', message: 'Close' })}
      overPhoto={false}
      testID="guide-practice"
    >
      <Stack.Screen options={{ headerShown: false }} />
      <ScrollView
        style={{ flex: 1, backgroundColor: th.color.ground }}
        contentContainerStyle={{
          paddingTop: insets.top + 64,
          paddingBottom: insets.bottom + 24,
          paddingHorizontal: th.space.gutter,
          gap: 20,
        }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ gap: 10 }}>
          <Text variant="guideName" tone="guideName">
            {props.guideName}
          </Text>
          <Text variant="largeTitle" accessibilityRole="header" singleLine={false}>
            {t({ id: 'guide.premium.practice.title', message: 'Say it out loud' })}
          </Text>
          {total === 0 ? null : (
            <ProgressBar
              label={t({ id: 'guide.practice.learned', message: 'Learned' })}
              value={learned}
              total={total}
              valueLabel={t({
                id: 'guide.practice.count',
                message: `${learned} of ${total} learned`,
              })}
              testID="guide-practice-count"
            />
          )}
        </View>
        {current === null ? (
          <EmptyState
            title={t({ id: 'guide.premium.practice.emptyTitle', message: 'No phrases yet' })}
            line={t({
              id: 'guide.practice.empty',
              message: `No phrases for this trip yet. ${props.guideName} adds them as the plan fills in.`,
            })}
            testID="guide-practice-empty"
          />
        ) : (
          <Animated.View layout={layoutTransition(reduced)} style={{ gap: 14 }}>
            {props.card}
            {current.romanisation === null ? null : (
              <Text variant="rowText" tone="muted">
                {current.romanisation}
              </Text>
            )}
            <PremiumPracticeFeedback
              guideName={props.guideName}
              language={current.language}
              state={state}
              onSaid={props.onSaid}
              onOpenSettings={props.onOpenSettings}
            />
            <Answer {...props} canListen={canListen} />
          </Animated.View>
        )}
        <CheckSwitch {...props} />
        <PhraseList
          title={t({ id: 'guide.practice.practising', message: 'Practising' })}
          phrases={lists.practising}
          currentId={current?.id ?? null}
          onPick={props.onPick}
          testID="guide-practice-practising"
        />
        <PhraseList
          title={t({ id: 'guide.practice.learned', message: 'Learned' })}
          phrases={lists.learned}
          currentId={current?.id ?? null}
          onPick={props.onPick}
          testID="guide-practice-learned"
        />
      </ScrollView>
    </FullScreen>
  );
}
