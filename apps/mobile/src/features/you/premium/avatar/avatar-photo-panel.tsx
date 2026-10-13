/**
 * The avatar picker's Photo tab on the premium kit, in place rather than in a sheet: who sees a
 * photo, the ways to one as option rows (choose from Photos, take one; with the camera off, turn
 * it on in Settings), the cut-out to confirm, and the upload's progress and failures.
 */
import { useLingui } from '@lingui/react/macro';
import { Linking, View } from 'react-native';
import Animated from 'react-native-reanimated';

import type { useRealPhoto } from '@/features/onboarding';
import {
  Button,
  enterTransition,
  Icon,
  ListCard,
  Row,
  Spinner,
  Text,
  TextButton,
  usePremiumReducedMotion,
  usePremiumTheme,
} from '@/ui/premium';

type RealPhoto = ReturnType<typeof useRealPhoto>;

export function AvatarPhotoPanel(props: {
  readonly real: RealPhoto;
  /** False when this build has no photo picker. */
  readonly available: boolean;
  /** The photo waits for its check before crewmates see it. */
  readonly pending: boolean;
}) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const reduced = usePremiumReducedMotion();
  const { real } = props;
  const state = real.state;
  const denied = state.kind === 'camera_denied';
  const busy = state.kind === 'lifting' || state.kind === 'uploading';
  const status = (() => {
    switch (state.kind) {
      case 'lifting':
        return t({ id: 'onboarding.photo.real.lifting', message: 'Cutting you out…' });
      case 'uploading':
        return t({ id: 'onboarding.photo.real.uploading', message: 'Uploading' });
      case 'failed':
        return state.offline
          ? t({ id: 'onboarding.photo.real.offline', message: 'No signal for the upload' })
          : t({ id: 'onboarding.photo.real.failed', message: 'That photo didn’t go through' });
      case 'rate_limited':
        return t({ id: 'onboarding.photo.real.limitTitle', message: 'That’s a lot of photos' });
      case 'idle':
      case 'choosing':
      case 'preview':
      case 'done':
      case 'camera_denied':
        return null;
    }
  })();
  const chevron = <Icon name="forward" size={16} color={th.color.placeholder} />;
  return (
    <View style={{ gap: th.space.gap10 }}>
      <Text variant="body" tone="muted" style={{ paddingHorizontal: 6 }}>
        {props.pending
          ? t({
              id: 'you.avatar.photoPending',
              message: 'Until it’s checked, your crews see your initials.',
            })
          : t({ id: 'you.avatar.photoLine', message: 'Photos only show inside your crews.' })}
      </Text>
      {state.kind === 'preview' ? (
        <Animated.View
          entering={enterTransition(reduced)}
          style={{ gap: th.space.gap8 }}
          testID="you-avatar-photo-preview"
        >
          <Button
            label={t({ id: 'onboarding.photo.real.use', message: 'Use this photo' })}
            size="medium"
            onPress={real.confirm}
            testID="you-avatar-photo-use"
          />
          <TextButton
            label={t({ id: 'onboarding.photo.real.again', message: 'Pick another' })}
            onPress={() => void real.fromLibrary()}
          />
        </Animated.View>
      ) : null}
      {status === null ? null : (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: th.space.gap8,
            paddingHorizontal: 6,
          }}
          testID="you-avatar-photo-status"
        >
          {busy ? <Spinner color={th.color.ink} trackColor={th.color.control} /> : null}
          <Text
            variant="caption"
            color={
              state.kind === 'failed' || state.kind === 'rate_limited'
                ? th.color.destructive.helper
                : th.color.muted
            }
            style={{ flex: 1 }}
          >
            {status}
          </Text>
          {state.kind === 'failed' ? (
            <TextButton
              label={t({ id: 'onboarding.photo.real.retry', message: 'Try again' })}
              onPress={real.retry}
            />
          ) : null}
        </View>
      )}
      {props.available ? (
        <ListCard radius={20} testID="you-avatar-photo-options">
          <Row
            title={t({ id: 'onboarding.premium.photo.library', message: 'Choose from Photos' })}
            subtitle={t({
              id: 'onboarding.premium.photo.librarySub',
              message: 'Only the one you pick is shared',
            })}
            trailing={chevron}
            onPress={busy ? undefined : () => void real.fromLibrary()}
            testID="you-avatar-photo"
          />
          {denied ? (
            <Row
              title={t({ id: 'onboarding.premium.photo.cameraOn', message: 'Turn the camera on' })}
              subtitle={t({
                id: 'onboarding.premium.photo.cameraOnSub',
                message: 'In Settings, then come back',
              })}
              trailing={chevron}
              onPress={() => void Linking.openSettings()}
              testID="you-avatar-photo-settings"
            />
          ) : (
            <Row
              title={t({ id: 'onboarding.photo.real.camera', message: 'Take a photo' })}
              trailing={chevron}
              onPress={busy ? undefined : () => void real.fromCamera()}
              testID="you-avatar-photo-camera"
            />
          )}
        </ListCard>
      ) : null}
    </View>
  );
}
