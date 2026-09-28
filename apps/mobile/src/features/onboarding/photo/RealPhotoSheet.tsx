/**
 * The real-photo sheet (undesigned states, docs/undesigned-states.md): source choice, lifting,
 * the cut-out (or circle crop when no one is found) with zoom, upload progress, camera denied,
 * rate limited and failed. Built from the sheet, pill buttons, slider and denied row.
 */
import { t } from '@lingui/core/macro';
import { ActivityIndicator, View } from 'react-native';

import { openPermissionSettings } from '@/lib/permissions';
import { PhotoAvatar } from '@/ui/avatar';
import { PillButton } from '@/ui/buttons/PillButton';
import { Slider } from '@/ui/inputs/Slider';
import { LinearBar } from '@/ui/data/LinearBar';
import { DeniedRow } from '@/ui/permission-primer';
import { Sheet } from '@/ui/sheet/Sheet';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import type { RealPhotoState } from './use-real-photo';

export interface RealPhotoSheetProps {
  readonly state: RealPhotoState;
  readonly onLibrary: () => void;
  readonly onCamera: () => void;
  readonly onZoom: (zoom: number) => void;
  readonly onConfirm: () => void;
  readonly onRetry: () => void;
  readonly onClose: () => void;
}

const MAX_ZOOM = 2.5;

const useStyles = makeStyles((th) => ({
  body: { gap: th.space['14'], paddingHorizontal: th.space['20'], paddingBottom: th.space['24'] },
  center: { alignItems: 'center', gap: th.space['12'] },
}));

function Body(props: RealPhotoSheetProps) {
  const styles = useStyles();
  const theme = useTheme();
  const { state } = props;
  switch (state.kind) {
    case 'idle':
    case 'choosing':
      return (
        <View style={styles.body}>
          <Text variant="h2" accessibilityRole="header">
            {t({ id: 'onboarding.photo.real.title', message: 'Use a real photo' })}
          </Text>
          <Text variant="body" color={theme.semantic.text.secondary}>
            {t({
              id: 'onboarding.photo.real.body',
              message:
                'We cut you out like a sticker, right on your phone. Your crew sees it once it’s checked.',
            })}
          </Text>
          <PillButton
            label={t({ id: 'onboarding.photo.real.library', message: 'Choose a photo' })}
            onPress={props.onLibrary}
            testID="real-photo-library"
          />
          <PillButton
            label={t({ id: 'onboarding.photo.real.camera', message: 'Take a photo' })}
            variant="secondary"
            onPress={props.onCamera}
            testID="real-photo-camera"
          />
        </View>
      );
    case 'lifting':
      return (
        <View style={[styles.body, styles.center]} testID="real-photo-lifting">
          <ActivityIndicator color={theme.color.yellow} />
          <Text variant="body">
            {t({ id: 'onboarding.photo.real.lifting', message: 'Cutting you out…' })}
          </Text>
        </View>
      );
    case 'preview':
      return (
        <View style={styles.body} testID="real-photo-preview">
          <View style={styles.center}>
            <View style={{ transform: [{ scale: state.zoom }] }}>
              <PhotoAvatar uri={state.uri} size={180} cutout={state.lifted} />
            </View>
            {state.lifted ? null : (
              <Text
                variant="bodySm"
                color={theme.semantic.text.secondary}
                testID="real-photo-no-subject"
              >
                {t({
                  id: 'onboarding.photo.real.noSubject',
                  message: 'We couldn’t find you in this one, so it’s a circle crop.',
                })}
              </Text>
            )}
          </View>
          <Slider
            label={t({ id: 'onboarding.photo.real.zoom', message: 'Zoom' })}
            value={(state.zoom - 1) / (MAX_ZOOM - 1)}
            onChange={(value) => props.onZoom(1 + value * (MAX_ZOOM - 1))}
            testID="real-photo-zoom"
          />
          <PillButton
            label={t({ id: 'onboarding.photo.real.use', message: 'Use this photo' })}
            onPress={props.onConfirm}
            testID="real-photo-use"
          />
          <PillButton
            label={t({ id: 'onboarding.photo.real.again', message: 'Pick another' })}
            variant="tertiary"
            onPress={props.onLibrary}
          />
        </View>
      );
    case 'uploading':
      return (
        <View style={[styles.body, styles.center]} testID="real-photo-uploading">
          <PhotoAvatar uri={state.preview} size={120} cutout dimmed />
          <LinearBar
            value={state.progress}
            max={1}
            label={t({ id: 'onboarding.photo.real.uploading', message: 'Uploading' })}
          />
        </View>
      );
    case 'done':
      return (
        <View style={[styles.body, styles.center]} testID="real-photo-done">
          <PhotoAvatar uri={state.uri} size={150} cutout={state.cutout} />
          <Text variant="body" color={theme.semantic.text.secondary}>
            {t({
              id: 'onboarding.photo.real.review',
              message: 'Looking good. Until it’s checked, your crew sees your initials.',
            })}
          </Text>
          <PillButton
            label={t({ id: 'onboarding.photo.real.done', message: 'Done' })}
            onPress={props.onClose}
            testID="real-photo-close"
          />
        </View>
      );
    case 'camera_denied':
      return (
        <View style={styles.body} testID="real-photo-camera-denied">
          <DeniedRow
            line={t({
              id: 'onboarding.photo.real.cameraDenied',
              message: 'The camera is off for CritterPass. You can still choose a photo.',
            })}
            onOpenSettings={() => void openPermissionSettings('camera')}
          />
          <PillButton
            label={t({ id: 'onboarding.photo.real.library', message: 'Choose a photo' })}
            onPress={props.onLibrary}
          />
        </View>
      );
    case 'rate_limited':
      return (
        <View style={styles.body} testID="real-photo-rate-limited">
          <Text variant="h3">
            {t({ id: 'onboarding.photo.real.limitTitle', message: 'That’s a lot of photos' })}
          </Text>
          <Text variant="body" color={theme.semantic.text.secondary}>
            {state.retryAfterS === null
              ? t({
                  id: 'onboarding.photo.real.limitLater',
                  message: 'Try again a bit later, or pick a guide for now.',
                })
              : t({
                  id: 'onboarding.photo.real.limitMinutes',
                  message: `Try again in ${Math.max(1, Math.ceil(state.retryAfterS / 60))} min, or pick a guide for now.`,
                })}
          </Text>
          <PillButton
            label={t({ id: 'onboarding.photo.real.pickGuide', message: 'Pick a guide' })}
            onPress={props.onClose}
          />
        </View>
      );
    case 'failed':
      return (
        <View style={styles.body} testID="real-photo-failed">
          <Text variant="h3">
            {state.offline
              ? t({ id: 'onboarding.photo.real.offline', message: 'No signal for the upload' })
              : t({ id: 'onboarding.photo.real.failed', message: 'That photo didn’t go through' })}
          </Text>
          <PillButton
            label={t({ id: 'onboarding.photo.real.retry', message: 'Try again' })}
            onPress={props.onRetry}
            testID="real-photo-retry"
          />
          <PillButton
            label={t({ id: 'onboarding.photo.real.pickGuide', message: 'Pick a guide' })}
            variant="secondary"
            onPress={props.onClose}
          />
        </View>
      );
  }
}

export function RealPhotoSheet(props: RealPhotoSheetProps) {
  if (props.state.kind === 'idle') return null;
  return (
    <Sheet
      detents={['fit']}
      onDismiss={props.onClose}
      accessibilityLabel={t({ id: 'onboarding.photo.real.title', message: 'Use a real photo' })}
      testID="real-photo-sheet"
    >
      <Body {...props} />
    </Sheet>
  );
}
