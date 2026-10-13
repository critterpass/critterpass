/**
 * Point and ask (5.16): the camera full bleed on its dark ground with the viewfinder's corners, ✕
 * and the language pair on clear glass, then the still with its translations stuck on; the sheet
 * underneath carries the guide's line, the allergy caution, the crew's order card, quick follow-ups
 * and "Ask about this menu". Camera off and no camera read in the guide's words.
 */
import { t } from '@lingui/core/macro';
import { Stack } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import {
  Button,
  Composer,
  GlassPill,
  PressableScale,
  Text,
  TextButton,
  makePremiumStyles,
  usePremiumTheme,
} from '@/ui/premium';
import { FullScreen, useScreenInsets } from '@/ui/premium/shell';

import type { CameraViewProps } from '../../camera/camera-view';
import { useIssueLine } from '../../camera/menu-issue-line';
import { menuStickers, showsFlags } from '../../camera/menu-scan';
import { MENU_PAINT } from '../guide-paint';
import { MenuLabels } from './menu-labels';
import { PremiumOrderCard } from './order-card';

const useStyles = makePremiumStyles((th) => ({
  corner: { position: 'absolute', width: 34, height: 34, borderColor: th.accent.stickerEdge },
  sheet: {
    borderTopLeftRadius: 34,
    borderTopRightRadius: 34,
    paddingTop: 8,
    gap: 12,
    backgroundColor: th.color.ground,
  },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: th.color.outlineEmpty,
  },
  inset: { paddingHorizontal: 16 },
  guide: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  disc: {
    width: 34,
    height: 34,
    borderRadius: 17,
    overflow: 'hidden',
    backgroundColor: th.accent.sun,
  },
  action: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    justifyContent: 'center',
    backgroundColor: th.color.card,
    boxShadow: th.shadow.card,
  },
}));

function Corners() {
  const styles = useStyles();
  const corner = (position: object) => <View style={[styles.corner, position]} />;
  return (
    <View
      style={[StyleSheet.absoluteFill, { margin: 30, marginTop: 112, marginBottom: 40 }]}
      pointerEvents="none"
    >
      {corner({ top: 0, left: 0, borderTopWidth: 3, borderLeftWidth: 3, borderTopLeftRadius: 10 })}
      {corner({
        top: 0,
        right: 0,
        borderTopWidth: 3,
        borderRightWidth: 3,
        borderTopRightRadius: 10,
      })}
      {corner({
        bottom: 0,
        left: 0,
        borderBottomWidth: 3,
        borderLeftWidth: 3,
        borderBottomLeftRadius: 10,
      })}
      {corner({
        bottom: 0,
        right: 0,
        borderBottomWidth: 3,
        borderRightWidth: 3,
        borderBottomRightRadius: 10,
      })}
    </View>
  );
}

export function PremiumCameraScene(props: CameraViewProps) {
  const th = usePremiumTheme();
  const styles = useStyles();
  const insets = useScreenInsets();
  const { state } = props;
  const [draft, setDraft] = useState('');
  const issue = useIssueLine(state.issue, props.guideName);
  const aiming = state.phase === 'aiming' || state.phase === 'capturing';
  const cannotScan = state.issue === 'no_camera' || state.issue === 'camera_denied';
  const ordering = state.phase === 'result' && state.reading !== null && props.order !== undefined;
  const line =
    issue ??
    (state.phase === 'reading'
      ? t({ id: 'guide.camera.reading', message: 'Reading the menu…' })
      : state.phase === 'result'
        ? (state.reading?.suggestion ??
          t({ id: 'guide.camera.read', message: "Here's what's on it. Ask me about any dish." }))
        : t({
            id: 'guide.camera.aim',
            message: "Point me at a menu and I'll put it in your words.",
          }));
  const ask = () => {
    const question = draft.trim();
    if (question === '') return;
    setDraft('');
    props.onAsk(question);
  };
  return (
    <FullScreen
      closeLabel={t({ id: 'guide.premium.camera.close', message: 'Close' })}
      onClose={props.onClose}
      testID="guide-camera"
    >
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, experimental_backgroundImage: MENU_PAINT.ground }}>
        {aiming ? (
          <>
            <View style={{ flex: 1 }}>{props.camera}</View>
            <Corners />
          </>
        ) : null}
        {aiming || state.still === null ? null : (
          <ScrollView
            contentContainerStyle={{
              paddingTop: insets.top + 64,
              paddingHorizontal: 12,
              paddingBottom: 16,
            }}
          >
            <MenuLabels still={state.still} stickers={menuStickers(state.lines, state.reading)}>
              {props.still}
            </MenuLabels>
          </ScrollView>
        )}
        {state.phase !== 'result' || !props.languages ? null : (
          <View
            style={{ position: 'absolute', top: insets.top + 8, alignSelf: 'center' }}
            testID="guide-camera-languages"
            pointerEvents="none"
          >
            <GlassPill label={props.languages} kind="clear" />
          </View>
        )}
      </View>
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 10 }]}>
        <View style={styles.grabber} />
        <View style={[styles.inset, styles.guide]}>
          <View style={styles.disc}>{props.sticker}</View>
          <Text
            variant="body"
            style={{ flex: 1 }}
            accessibilityLiveRegion="polite"
            testID={
              state.issue === null
                ? `guide-camera-line-${state.phase}`
                : `guide-camera-issue-${state.issue}`
            }
          >
            {line}
          </Text>
        </View>
        {showsFlags(state.reading) ? (
          <Text
            variant="captionMuted"
            tone="muted"
            style={styles.inset}
            testID="guide-camera-caution"
          >
            {t({
              id: 'guide.camera.caution',
              message: 'Flags are a guide, not medical advice. Ask staff about allergies.',
            })}
          </Text>
        ) : null}
        {state.issue === 'camera_denied' ? (
          <View style={[styles.inset, { gap: 8 }]} testID="guide-camera-denied">
            <Text variant="rowTitle">
              {t({ id: 'guide.camera.deniedTitle', message: 'The camera is off' })}
            </Text>
            <Text variant="captionMuted" tone="muted">
              {t({
                id: 'guide.camera.deniedBody',
                message: `${props.guideName} can't see the menu without the camera. Turn it on in Settings, or type a dish name in the chat.`,
              })}
            </Text>
            {props.onOpenSettings === undefined ? null : (
              <Button
                size="medium"
                label={t({ id: 'chat.premium.openSettings', message: 'Open Settings' })}
                onPress={props.onOpenSettings}
              />
            )}
          </View>
        ) : null}
        {cannotScan ? (
          <View style={styles.inset}>
            <TextButton
              label={t({ id: 'guide.voice.typeInstead', message: 'Type instead' })}
              onPress={props.onClose}
              testID="guide-camera-type"
            />
          </View>
        ) : null}
        {ordering && props.order !== undefined ? (
          <View style={styles.inset}>
            <PremiumOrderCard {...props.order} />
          </View>
        ) : null}
        {!ordering &&
        state.phase === 'result' &&
        state.reading !== null &&
        props.followUps.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
            testID="guide-camera-follow-ups"
          >
            {props.followUps.map((action, index) => (
              <PressableScale
                key={action.id}
                style={[styles.action, index === 0 ? { backgroundColor: th.color.ink } : null]}
                onPress={action.onPress}
                accessibilityRole="button"
                testID={`guide-camera-follow-${action.id}`}
              >
                <Text variant="rowTextStrong" tone={index === 0 ? 'onInk' : 'ink'}>
                  {action.label}
                </Text>
              </PressableScale>
            ))}
          </ScrollView>
        ) : null}
        {ordering ? null : state.phase === 'result' ? (
          <View style={{ gap: 6 }}>
            {state.reading === null ? null : (
              <View style={{ paddingHorizontal: 12 }}>
                <Composer
                  value={draft}
                  onChangeText={setDraft}
                  onSend={ask}
                  canSend={draft.trim() !== ''}
                  sendLabel={t({ id: 'guide.premium.send', message: 'Ask' })}
                  placeholder={t({
                    id: 'guide.camera.askPlaceholder',
                    message: 'Ask about this menu',
                  })}
                  accessibilityLabel={t({
                    id: 'guide.camera.askPlaceholder',
                    message: 'Ask about this menu',
                  })}
                  returnKeyType="send"
                  onSubmitEditing={ask}
                  testID="guide-camera-composer"
                />
              </View>
            )}
            <View style={{ alignItems: 'center' }}>
              <TextButton
                label={t({ id: 'guide.camera.retake', message: 'Read another menu' })}
                onPress={props.onRetake}
                testID="guide-camera-retake"
              />
            </View>
          </View>
        ) : cannotScan ? null : (
          <View style={styles.inset}>
            <Button
              label={t({ id: 'guide.camera.scan', message: 'Read this menu' })}
              onPress={props.onScan}
              loading={state.phase !== 'aiming'}
              disabled={state.phase !== 'aiming'}
              testID="guide-camera-scan"
            />
          </View>
        )}
      </View>
    </FullScreen>
  );
}
