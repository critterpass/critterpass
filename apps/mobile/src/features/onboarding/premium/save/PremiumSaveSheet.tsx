/**
 * The 2.12 save sheet as a piece a page lays over itself (`DrawnSheet`: the dim page, the glass
 * sheet with a grabber that drags), and the save choice (Apple on iOS, Google, a phone number, "Not now"), or the merge
 * choice once a sign-in already holds a pass, its "kept" explanation and the line that keeps the
 * switch on offer. With `mergeOnly` the sheet shows only the merge choice and its explanation (the
 * phone page, where the number was the sign-in).
 */
import { t } from '@lingui/core/macro';
import { Platform, View } from 'react-native';

import {
  Button,
  CritterSticker,
  PressableScale,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';

import { guideFacts } from '../../guide-faces';
import { declinedLine, keptBody, mergeBody } from '../../save/merge-copy';
import { saveErrorLine } from '../../save/save-copy';
import type { SaveState } from '../../save/use-save-flow';
import { SignInMark } from '../components/SignInMark';
import { DrawnSheet } from './drawn-sheet';

export interface PremiumSaveSheetProps {
  readonly state: SaveState;
  readonly mergeOnly?: boolean;
  readonly onApple: () => void;
  readonly onGoogle: () => void;
  readonly onPhone: () => void;
  /** "Not now", and a tap on the dim page while the save choice shows. */
  readonly onNotNow: () => void;
  readonly onUseExisting: () => void;
  readonly onKeepNew: () => void;
  /** Closes the "kept" explanation (and the merge-only sheet); the switch stays on offer. */
  readonly onKeptDone: () => void;
  readonly onReopenMerge: () => void;
}

export function ProviderButton({
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

function SaveChoice(props: PremiumSaveSheetProps & { readonly busy: boolean }) {
  const theme = usePremiumTheme();
  const { state, busy } = props;
  const working = state.kind === 'working' ? state.provider : null;
  const tokek = guideFacts('tokek');
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
        <View style={{ gap: theme.space.gap4, alignItems: 'flex-start' }} testID="merge-declined">
          <Text variant="caption" tone="muted">
            {declinedLine(state.provider)}
          </Text>
          <TextButton
            label={t({ id: 'onboarding.merge.switchBack', message: 'Use my old pass instead' })}
            onPress={props.onReopenMerge}
            align="start"
            testID="merge-declined-switch"
          />
        </View>
      ) : null}
      {Platform.OS === 'ios' ? (
        <ProviderButton
          provider="apple"
          label={t({ id: 'onboarding.save.apple', message: 'Continue with Apple' })}
          ink
          onPress={props.onApple}
          loading={working === 'apple'}
          disabled={busy}
          testID="save-apple"
        />
      ) : null}
      <ProviderButton
        provider="google"
        label={t({ id: 'onboarding.save.google', message: 'Continue with Google' })}
        ink={Platform.OS !== 'ios'}
        onPress={props.onGoogle}
        loading={working === 'google'}
        disabled={busy}
        testID="save-google"
      />
      <TextButton
        label={t({ id: 'onboarding.save.phone', message: 'Use my phone number' })}
        tone="inkSecondary"
        onPress={props.onPhone}
        disabled={busy}
        testID="save-phone"
      />
      <TextButton
        label={t({ id: 'onboarding.save.notNow', message: 'Not now' })}
        onPress={props.onNotNow}
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
}

function MergeChoice(props: PremiumSaveSheetProps & { readonly busy: boolean }) {
  const theme = usePremiumTheme();
  const { state } = props;
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
          onPress={props.onKeptDone}
          testID="merge-kept-done"
        />
        <TextButton
          align="center"
          label={t({ id: 'onboarding.merge.switchBack', message: 'Use my old pass instead' })}
          onPress={props.onUseExisting}
          testID="merge-kept-switch"
        />
      </View>
    );
  }
  if (state.kind !== 'merge' && state.kind !== 'merging') return null;
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
        onPress={props.onUseExisting}
        loading={state.kind === 'merging'}
        testID="merge-use-existing"
      />
      <Button
        label={t({ id: 'onboarding.merge.keepNew', message: 'Keep this new pass' })}
        variant="secondary"
        onPress={props.onKeepNew}
        disabled={props.busy}
        testID="merge-keep-new"
      />
    </View>
  );
}

export function PremiumSaveSheet(props: PremiumSaveSheetProps) {
  const { state, mergeOnly = false } = props;
  const merging = state.kind === 'merge' || state.kind === 'merging' || state.kind === 'kept';
  if (state.kind === 'saved' || state.kind === 'switched') return null;
  if (mergeOnly && !merging) return null;
  const busy = state.kind === 'working' || state.kind === 'merging';
  // The dim page and a drag down skip the save (the sheet slides out, then the page moves on), or
  // keep the new pass, where the sheet stays for the save choice.
  return (
    <DrawnSheet
      onDismiss={busy ? undefined : merging ? props.onKeptDone : props.onNotNow}
      dismissLeaves={!merging}
      scrimLabel={t({ id: 'onboarding.save.notNow', message: 'Not now' })}
      testID={mergeOnly ? 'merge-sheet' : 'save-sheet'}
    >
      {(leave) =>
        merging ? (
          <MergeChoice {...props} busy={busy} />
        ) : (
          <SaveChoice {...props} onNotNow={() => leave(props.onNotNow)} busy={busy} />
        )
      }
    </DrawnSheet>
  );
}
