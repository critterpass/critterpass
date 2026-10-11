/**
 * 2.12 "Keep it safe": a one-choice sheet over the issued pass (no Cancel or verb; tapping the dim
 * page or "Not now" skips, and saving is asked again later). Apple (iOS), Google and a phone number
 * link this pass to an account; a sign-in that already has a pass offers the switch. Saved, the
 * pass gets its SAVED mark and the page moves on.
 */
import { t } from '@lingui/core/macro';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  CritterSticker,
  GlassSurface,
  PressableScale,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';

import { guideFacts } from '../../guide-faces';
import { declinedLine, keptBody, mergeBody } from '../../save/merge-copy';
import { saveErrorLine } from '../../save/save-copy';
import { useSaveStep } from '../../save/use-save-step';
import { SHEET_SCRIM } from '../components/onboarding-colours';
import { SignInMark } from '../components/SignInMark';
import { PremiumIssuedView } from '../issued/PremiumIssuedPage';

function ProviderButton({
  provider,
  label,
  ink,
  onPress,
  loading,
  disabled,
  testID,
}: {
  readonly provider: 'apple' | 'google';
  readonly label: string;
  readonly ink: boolean;
  readonly onPress: () => void;
  readonly loading: boolean;
  readonly disabled: boolean;
  readonly testID: string;
}) {
  const theme = usePremiumTheme();
  const text = ink ? theme.color.onInk : theme.color.ink;
  return (
    <PressableScale
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ busy: loading, disabled }}
      testID={testID}
    >
      <View
        style={{
          height: theme.size.button,
          borderRadius: theme.radius.button,
          backgroundColor: ink ? theme.color.ink : theme.color.card,
          boxShadow: ink ? theme.shadow.ink : theme.shadow.float,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: theme.space.gap10,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        <SignInMark provider={provider} color={text} />
        <Text variant="button" color={text}>
          {loading ? t({ id: 'onboarding.premium.save.working', message: 'Signing in…' }) : label}
        </Text>
      </View>
    </PressableScale>
  );
}

export function PremiumSavePage() {
  const theme = usePremiumTheme();
  const insets = useSafeAreaInsets();
  const { flow, state, focused, notNow, phone } = useSaveStep();
  const tokek = guideFacts('tokek');
  const working = state.kind === 'working' ? state.provider : null;
  const busy = working !== null || state.kind === 'merging';
  const merge = state.kind === 'merge' || state.kind === 'merging';
  const showSheet = state.kind !== 'saved' && state.kind !== 'switched' && focused;

  const body = (() => {
    if (merge) {
      return (
        <View style={{ gap: theme.space.gap10 }} testID="merge-choice">
          <Text variant="emptyTitle">
            {t({ id: 'onboarding.merge.title', message: 'You already have a pass' })}
          </Text>
          <Text variant="rowText" tone="muted">
            {mergeBody(state.provider)}
          </Text>
          <Button
            label={t({ id: 'onboarding.merge.useOld', message: 'Use my old pass' })}
            onPress={() => void flow.confirmSwitch()}
            loading={state.kind === 'merging'}
            testID="merge-use-existing"
          />
          <Button
            label={t({ id: 'onboarding.merge.keepNew', message: 'Keep this new pass' })}
            variant="secondary"
            onPress={flow.keepThisPass}
            disabled={busy}
            testID="merge-keep-new"
          />
        </View>
      );
    }
    if (state.kind === 'kept') {
      return (
        <View style={{ gap: theme.space.gap10 }} testID="merge-kept">
          <Text variant="emptyTitle">
            {t({ id: 'onboarding.merge.keptTitle', message: 'Keeping the new pass' })}
          </Text>
          <Text variant="rowText" tone="muted">
            {keptBody(state.provider)}
          </Text>
          <Button
            label={t({ id: 'onboarding.merge.keptDone', message: 'Got it' })}
            onPress={flow.closeKept}
            testID="merge-kept-done"
          />
          <TextButton
            label={t({ id: 'onboarding.merge.switchBack', message: 'Use my old pass instead' })}
            onPress={() => void flow.confirmSwitch()}
            testID="merge-kept-switch"
          />
        </View>
      );
    }
    return (
      <View style={{ gap: theme.space.gap10 }}>
        <View style={{ flexDirection: 'row' }}>
          <View style={{ flex: 1, gap: theme.space.gap4, paddingEnd: theme.space.gap8 }}>
            <Text variant="emptyTitle" accessibilityRole="header">
              {t({ id: 'onboarding.save.title', message: 'Keep it safe' })}
            </Text>
            <Text variant="rowText" tone="muted">
              {t({
                id: 'onboarding.save.body',
                message:
                  'So your pass, critters and crews survive a lost phone. We never post anything for you.',
              })}
            </Text>
          </View>
          <View style={{ marginTop: -30 }}>
            <CritterSticker kind={tokek.kind} name={tokek.name} size={78} pose="think" />
          </View>
        </View>
        {state.kind === 'error' ? (
          <Text variant="caption" color={theme.color.destructive.helper} testID="save-error">
            {saveErrorLine(state.reason)}
          </Text>
        ) : null}
        {state.kind === 'declined' ? (
          <Text variant="caption" tone="muted" testID="merge-declined">
            {declinedLine(state.provider)}
          </Text>
        ) : null}
        {Platform.OS === 'ios' ? (
          <ProviderButton
            provider="apple"
            label={t({ id: 'onboarding.save.apple', message: 'Continue with Apple' })}
            ink
            onPress={() => void flow.apple()}
            loading={working === 'apple'}
            disabled={busy}
            testID="save-apple"
          />
        ) : null}
        <ProviderButton
          provider="google"
          label={t({ id: 'onboarding.save.google', message: 'Continue with Google' })}
          ink={Platform.OS !== 'ios'}
          onPress={() => void flow.google()}
          loading={working === 'google'}
          disabled={busy}
          testID="save-google"
        />
        <TextButton
          label={t({ id: 'onboarding.save.phone', message: 'Use my phone number' })}
          tone="inkSecondary"
          onPress={phone}
          disabled={busy}
          testID="save-phone"
        />
        <TextButton
          label={t({ id: 'onboarding.save.notNow', message: 'Not now' })}
          onPress={notNow}
          disabled={busy}
          testID="save-not-now"
        />
        <Text variant="captionMuted" align="center">
          {t({
            id: 'onboarding.save.terms',
            message: 'By continuing you agree to the Terms and the Privacy Policy.',
          })}
        </Text>
      </View>
    );
  })();

  return (
    <View style={{ flex: 1 }} testID="onboarding-save">
      <PremiumIssuedView choreography={false} />
      {showSheet ? (
        <>
          <Pressable
            style={[StyleSheet.absoluteFill, { backgroundColor: SHEET_SCRIM }]}
            onPress={busy ? undefined : notNow}
            accessibilityRole="button"
            accessibilityLabel={t({ id: 'onboarding.save.notNow', message: 'Not now' })}
          />
          <GlassSurface
            kind="sheet"
            style={{
              position: 'absolute',
              left: 8,
              right: 8,
              bottom: 8,
              borderRadius: theme.radius.sheet,
              paddingHorizontal: 18,
              paddingTop: 12,
              paddingBottom: Math.max(insets.bottom, 22),
            }}
            testID="save-sheet"
          >
            <View
              style={{
                alignSelf: 'center',
                width: 36,
                height: 5,
                borderRadius: 3,
                backgroundColor: theme.color.outlineEmpty,
                marginBottom: 14,
              }}
            />
            {body}
          </GlassSurface>
        </>
      ) : null}
    </View>
  );
}
