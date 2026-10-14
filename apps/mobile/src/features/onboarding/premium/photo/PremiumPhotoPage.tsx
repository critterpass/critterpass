/**
 * 2.08 "Pick your passport photo": the face on the pass in a 184 disc, the guides to pick from, and
 * the ways to a real photo as option rows (choose from Photos, take one; with the camera off, turn
 * it on in Settings). The real photo's cut-out, upload and failures show in place.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { Image, Linking, View } from 'react-native';

import {
  Button,
  CritterSticker,
  Icon,
  ListCard,
  PressableScale,
  ring,
  Row,
  ROW_ROOM_ABOVE,
  ROW_ROOM_BELOW,
  ScrollRow,
  Spinner,
  Text,
  TextButton,
  usePremiumTheme,
} from '@/ui/premium';

import { usePhotoStep } from '../../photo/use-photo-step';
import { OptionTile } from '../components/OptionTile';
import { WizardPage } from '../components/WizardPage';

const DISC = 184;

export function PremiumPhotoPage() {
  const theme = usePremiumTheme();
  const step = usePhotoStep();
  const { draft, face, real } = step;
  const state = real.state;
  const denied = state.kind === 'camera_denied';
  const photoUri = draft.avatar?.kind === 'photo' ? draft.photo_uri : null;

  const realStatus = (() => {
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
      case 'done':
        return t({
          id: 'onboarding.photo.real.review',
          message: 'Looking good. Until it’s checked, your crew sees your initials.',
        });
      case 'idle':
      case 'choosing':
      case 'preview':
      case 'camera_denied':
        return null;
    }
  })();

  return (
    <WizardPage
      step={{ current: 2, total: 4 }}
      backLabel={t({ id: 'onboarding.invite.code.back', message: 'Back' })}
      onBack={() => router.back()}
      testID="onboarding-photo"
      footer={
        <>
          <Button
            label={t({ id: 'onboarding.photo.next', message: 'That’s me' })}
            onPress={step.next}
            disabled={state.kind === 'uploading' || state.kind === 'lifting'}
            testID="onboarding-photo-next"
          />
          <TextButton
            align="center"
            label={t({ id: 'onboarding.premium.photo.skip', message: 'Skip this step' })}
            onPress={step.next}
            testID="onboarding-photo-skip"
          />
        </>
      }
    >
      <View style={{ alignItems: 'center' }}>
        <View
          testID="onboarding-photo-frame"
          style={{
            width: DISC,
            height: DISC,
            borderRadius: DISC / 2,
            borderWidth: 2,
            borderStyle: 'dashed',
            borderColor: theme.color.outlineEmpty,
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View
            style={{
              width: DISC - 32,
              height: DISC - 32,
              borderRadius: (DISC - 32) / 2,
              backgroundColor: theme.color.control,
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
            }}
          >
            {state.kind === 'preview' ? (
              <Image source={{ uri: state.uri }} style={{ width: DISC - 32, height: DISC - 32 }} />
            ) : photoUri !== null ? (
              <Image source={{ uri: photoUri }} style={{ width: DISC - 32, height: DISC - 32 }} />
            ) : face !== null ? (
              <CritterSticker
                kind={face.kind}
                name={face.name}
                seed={face.seed}
                size={132}
                pose={denied ? 'sleep' : 'wave'}
              />
            ) : null}
          </View>
        </View>
      </View>
      <View style={{ alignItems: 'center', gap: theme.space.gap8 }}>
        <Text variant="emptyTitle" align="center" accessibilityRole="header">
          {denied
            ? t({ id: 'onboarding.premium.photo.cameraOffTitle', message: 'The camera’s off' })
            : t({ id: 'onboarding.photo.title', message: 'Pick your passport photo' })}
        </Text>
        <Text variant="body" tone="muted" align="center">
          {denied
            ? t({
                id: 'onboarding.photo.real.cameraDenied',
                message: 'The camera is off for CritterPass. You can still choose a photo.',
              })
            : t({
                id: 'onboarding.photo.body',
                message: 'Any guide works. You’ll earn more faces on the road.',
              })}
        </Text>
      </View>
      <ScrollRow
        gap={theme.space.gap10}
        // Reaches through the page's gutter, so the picked face's ring and the last face's
        // shadow are not cut at the padding.
        bleed={theme.space.titleGutter}
        // 6 above and below the faces, as the row kept; its ring and shadow room sits inside.
        style={{
          marginTop: theme.space.gap6 - ROW_ROOM_ABOVE,
          marginBottom: theme.space.gap6 - ROW_ROOM_BELOW,
        }}
        testID="onboarding-photo-guides"
      >
        {step.faces.map((guide) => {
          const on = step.selected === guide.id;
          return (
            <PressableScale
              key={guide.id}
              onPress={() => step.pick(guide.id)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={guide.name}
              testID={`avatar-${guide.id}`}
            >
              <View
                style={{
                  width: 64,
                  height: 64,
                  borderRadius: 32,
                  backgroundColor: theme.color.card,
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: on ? ring(2.5, theme.color.ink) : theme.shadow.raised,
                }}
              >
                <CritterSticker kind={guide.kind} name={guide.name} seed={guide.seed} size={52} />
              </View>
            </PressableScale>
          );
        })}
      </ScrollRow>
      {state.kind === 'preview' ? (
        <View style={{ gap: theme.space.gap8 }} testID="onboarding-photo-preview">
          <Button
            label={t({ id: 'onboarding.photo.real.use', message: 'Use this photo' })}
            size="medium"
            onPress={real.confirm}
          />
          <TextButton
            label={t({ id: 'onboarding.photo.real.again', message: 'Pick another' })}
            onPress={() => void real.fromLibrary()}
          />
        </View>
      ) : null}
      {realStatus === null ? null : (
        <View
          style={{ flexDirection: 'row', alignItems: 'center', gap: theme.space.gap8 }}
          testID="onboarding-photo-status"
        >
          {state.kind === 'lifting' || state.kind === 'uploading' ? (
            <Spinner color={theme.color.ink} trackColor={theme.color.control} />
          ) : null}
          <Text
            variant="caption"
            color={
              state.kind === 'failed' || state.kind === 'rate_limited'
                ? theme.color.destructive.helper
                : theme.color.muted
            }
            style={{ flex: 1 }}
          >
            {realStatus}
          </Text>
          {state.kind === 'failed' ? (
            <TextButton
              label={t({ id: 'onboarding.photo.real.retry', message: 'Try again' })}
              onPress={real.retry}
            />
          ) : null}
        </View>
      )}
      {step.realPhotos ? (
        <ListCard testID="onboarding-photo-options">
          <Row
            title={t({ id: 'onboarding.premium.photo.library', message: 'Choose from Photos' })}
            subtitle={t({
              id: 'onboarding.premium.photo.librarySub',
              message: 'Only the one you pick is shared',
            })}
            leading={
              <OptionTile bg={theme.color.status.rain.bg}>
                <Icon name="photos" size={20} color={theme.color.status.rain.text} />
              </OptionTile>
            }
            trailing={<Icon name="forward" size={16} color={theme.color.placeholder} />}
            onPress={() => void real.fromLibrary()}
            testID="onboarding-photo-real"
          />
          {denied ? (
            <Row
              title={t({ id: 'onboarding.premium.photo.cameraOn', message: 'Turn the camera on' })}
              subtitle={t({
                id: 'onboarding.premium.photo.cameraOnSub',
                message: 'In Settings, then come back',
              })}
              leading={
                <OptionTile bg={theme.color.control}>
                  <Icon name="camera" size={20} color={theme.color.inkSecondary} />
                </OptionTile>
              }
              trailing={<Icon name="forward" size={16} color={theme.color.placeholder} />}
              onPress={() => void Linking.openSettings()}
              testID="onboarding-photo-settings"
            />
          ) : (
            <Row
              title={t({ id: 'onboarding.photo.real.camera', message: 'Take a photo' })}
              leading={
                <OptionTile bg={theme.color.status.tangerine.bg}>
                  <Icon name="camera" size={20} color={theme.color.status.tangerine.text} />
                </OptionTile>
              }
              trailing={<Icon name="forward" size={16} color={theme.color.placeholder} />}
              onPress={() => void real.fromCamera()}
              testID="onboarding-photo-camera"
            />
          )}
        </ListCard>
      ) : null}
    </WizardPage>
  );
}
