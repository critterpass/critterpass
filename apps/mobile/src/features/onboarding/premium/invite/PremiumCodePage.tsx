/**
 * 2.15 / 2.16 "Got a code?": six tiles (the real code alphabet: no 0, 1, I, L, O or U), the
 * system paste control (nothing is read until it is tapped), the crew card rising when the code is
 * found, a pink shake and one line when it is wrong, and joining (the waitlist on a full trip).
 * Problems a join can't fix show in place with their one way forward.
 */
import { t } from '@lingui/core/macro';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { useLocale } from '@/lib/i18n/use-locale';
import {
  Button,
  CritterSticker,
  CrewStack,
  Icon,
  Skeleton,
  Text,
  TextButton,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

import { guideBySlug } from '../../guide-faces';
import { inviteProblemCopy } from '../../invited/invite-problem-copy';
import { HANDOFF_ROUTES, withoutSeatRoute } from '../../invited/routes';
import { ticketFacts } from '../../invited/ticket-facts';
import { CODE_LENGTH, useCodeEntry } from '../../invited/use-code-entry';
import { CodeTiles } from '../components/CodeTiles';
import { memberAccent } from '../components/member-colour';
import { WizardPage } from '../components/WizardPage';
import { WizardHeader } from '../components/WizardHeader';
import { ScanQrButton } from './ScanQrButton';

export function PremiumCodePage() {
  const theme = usePremiumTheme();
  const locale = useLocale();
  const reduced = usePremiumReducedMotion();
  const entry = useCodeEntry();
  const { model, problem } = entry;
  const crew = model.crewName ?? '';
  const inviter = model.inviterFirstName ?? '';
  const facts = ticketFacts(model, locale);
  const guide = guideBySlug(model.guideSlug);
  const count = model.members.length;
  const guideName = guide.name;
  const backLabel = t({ id: 'onboarding.invite.code.back', message: 'Back' });

  const problemAction =
    entry.joinFailed || problem === null
      ? undefined
      : problem === 'offline'
        ? {
            label: t({ id: 'onboarding.invite.problem.retry', message: 'Try again' }),
            onPress: entry.retry,
          }
        : problem === 'referral'
          ? {
              label:
                withoutSeatRoute() === HANDOFF_ROUTES.home
                  ? t({ id: 'onboarding.invite.pass.home', message: 'Go home' })
                  : t({ id: 'onboarding.invite.problem.startPass', message: 'Make my pass' }),
              onPress: () => router.replace(withoutSeatRoute()),
            }
          : undefined;
  const problemCopy =
    problem === null ? null : inviteProblemCopy(problem, model.inviterFirstName, model.crewName);

  return (
    <WizardPage
      backLabel={backLabel}
      header={
        <View>
          <WizardHeader label="" backLabel={backLabel} onBack={() => router.back()} />
          {Clipboard.isPasteButtonAvailable ? (
            <View style={{ position: 'absolute', right: theme.space.gutter, bottom: 5 }}>
              <Clipboard.ClipboardPasteButton
                acceptedContentTypes={['url', 'plain-text']}
                displayMode="iconAndLabel"
                backgroundColor={theme.color.card}
                foregroundColor={theme.color.ink}
                cornerStyle="capsule"
                style={{ width: 132, height: 34 }}
                onPress={(data) => {
                  if (data.type === 'text') entry.onPaste(data.text);
                }}
              />
            </View>
          ) : null}
        </View>
      }
      testID="invite-code-screen"
      footer={
        entry.joinable ? (
          <>
            <Button
              label={
                model.status === 'full'
                  ? t({
                      id: 'onboarding.invite.code.joinWaitlist',
                      message: `Join ${crew}’s waitlist`,
                    })
                  : t({ id: 'onboarding.invite.code.join', message: `Join ${crew}` })
              }
              onPress={entry.join}
              loading={entry.busy}
              testID="invite-code-join"
            />
            <View style={{ alignItems: 'center' }}>
              <TextButton
                label={t({
                  id: 'onboarding.invite.code.wrongCrew',
                  message: `Wrong crew? Ask ${inviter} for a new code`,
                })}
                onPress={entry.clear}
                testID="invite-code-wrong-crew"
              />
            </View>
          </>
        ) : undefined
      }
    >
      <View style={{ gap: theme.space.gap4 }}>
        <Text variant="largeTitle" accessibilityRole="header">
          {t({ id: 'onboarding.invite.code.title', message: 'Got a code?' })}
        </Text>
        <Text variant="body" tone="muted">
          {t({
            id: 'onboarding.premium.code.body',
            message:
              'Six letters and numbers from whoever invited you. Codes never use 0, O, 1, I, L or U.',
          })}
        </Text>
      </View>
      <CodeTiles
        value={entry.typed}
        onChangeText={entry.setTyped}
        length={CODE_LENGTH}
        error={entry.wrong}
        autoFocus
        onSubmit={entry.join}
        accessibilityLabel={t({ id: 'onboarding.invite.code.label', message: 'Crew code' })}
        testID="invite-code-boxes"
      />
      {entry.code === null ? (
        <ScanQrButton onInvite={(text) => entry.onPaste(text, 'scan')} />
      ) : null}
      {entry.pastedFrom !== null ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View
            style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: theme.signal.successCheck,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Icon name="check" size={10} color={theme.color.onAccent} />
          </View>
          <Text variant="caption" color={theme.color.status.booked.text}>
            {entry.pastedFrom}
          </Text>
        </View>
      ) : null}
      {entry.wrong ? (
        <Text variant="helper" color={theme.color.destructive.helper} testID="invite-code-wrong">
          {t({
            id: 'onboarding.premium.code.wrong',
            message: 'No crew uses that code. Check each one: codes never use 0, O, 1, I, L or U.',
          })}
        </Text>
      ) : null}
      {entry.code !== null && model.status === 'loading' ? (
        <View testID="invite-code-loading">
          <Skeleton height={170} radius={theme.radius.cardLarge} />
        </View>
      ) : null}
      {entry.found && problem === null ? (
        <Animated.View
          {...(reduced ? {} : { entering: FadeInDown.springify() })}
          testID="invite-code-found"
        >
          <View
            style={{
              borderRadius: theme.radius.cardLarge,
              backgroundColor: theme.color.card,
              boxShadow: theme.shadow.card,
              paddingVertical: 16,
              paddingHorizontal: 18,
              gap: theme.space.gap6,
            }}
          >
            <Text variant="mono" tone="muted">
              {t({ id: 'onboarding.invite.code.found', message: `Found it · ${inviter}’s crew` })}
            </Text>
            <Text variant="largeTitle" numberOfLines={2}>
              {crew}
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {[model.place, facts.dates]
                .filter((part): part is string => part !== null)
                .map((chip) => (
                  <View
                    key={chip}
                    style={{
                      height: 26,
                      paddingHorizontal: 10,
                      borderRadius: 13,
                      backgroundColor: theme.color.control,
                      justifyContent: 'center',
                    }}
                  >
                    <Text variant="caption">{chip}</Text>
                  </View>
                ))}
            </View>
            <View
              style={{
                marginTop: 8,
                paddingTop: 12,
                borderTopWidth: 1.5,
                borderStyle: 'dashed',
                borderColor: theme.color.fieldBorder,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <CrewStack
                members={model.members.map((m, i) => ({
                  id: `${m.name}-${String(i)}`,
                  name: m.name,
                  color: memberAccent(theme, m.colour),
                }))}
                accessibilityLabel={facts.members}
                size={28}
              />
              <Text variant="label" tone="muted" style={{ flex: 1, fontWeight: '400' }}>
                {t({
                  id: 'onboarding.invite.code.alreadyIn',
                  message: `${count} already in. ${guideName} is guiding.`,
                })}
              </Text>
            </View>
          </View>
          <View pointerEvents="none" style={{ position: 'absolute', right: -6, top: -38 }}>
            <CritterSticker kind={guide.kind} name={guide.name} size={86} pose="wave" />
          </View>
        </Animated.View>
      ) : null}
      {problemCopy === null ? null : (
        <View
          style={{
            borderRadius: theme.radius.cardRow,
            backgroundColor: theme.color.card,
            padding: 16,
            gap: 6,
          }}
          testID={`invite-problem-${problem ?? ''}`}
        >
          <Text variant="title">{problemCopy.title}</Text>
          <Text variant="rowText" tone="muted">
            {problemCopy.line}
          </Text>
          {problemAction === undefined ? null : (
            <Button label={problemAction.label} onPress={problemAction.onPress} size="small" />
          )}
        </View>
      )}
    </WizardPage>
  );
}
