/**
 * Point and ask (3j-3): the camera (or the still it took) fills the screen under the POINT AND
 * ASK pill, translations sit on the menu's lines, and the guide's panel at the foot holds its
 * suggestion, the follow-ups and "Ask about this menu". Whenever a dietary flag is on screen the
 * advisory line is too. Before a scan the panel holds the one button that takes the still.
 */
import { useLingui } from '@lingui/react/macro';
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';

import { upper } from '@cp/i18n';

import { Row, Scaffold, Stack, Text, makeStyles, sizeToken, useTheme } from '@/ui';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { Composer } from '@/ui/chat/Composer';
import { Tag } from '@/ui/plan/ActionPill';
import { PressScale } from '@/ui/press/PressScale';
import { PermissionCard } from '@/ui/states/PermissionCard';

import { useIssueLine } from './menu-issue-line';
import { menuStickers, showsFlags, type MenuScanState } from './menu-scan';
import { MenuStickers } from './menu-stickers';

export interface MenuFollowUp {
  readonly id: string;
  readonly label: string;
  readonly onPress: () => void;
}

export interface CameraViewProps {
  readonly guideName: string;
  readonly sticker: ReactNode;
  readonly state: MenuScanState;
  /** The live camera, shown while aiming. */
  readonly camera: ReactNode;
  /** The still that was read (the photo; a drawn menu in the lab). */
  readonly still: ReactNode;
  readonly followUps: readonly MenuFollowUp[];
  /** "Indonesian → English": the menu's language and the reader's, once the guide told it. */
  readonly languages?: string | null;
  /** The order card, while the person is putting an order together. */
  readonly order?: ReactNode;
  readonly onScan: () => void;
  readonly onRetake: () => void;
  /** "Ask about this menu": the question goes to the guide with the dishes. */
  readonly onAsk: (question: string) => void;
  readonly onMic?: () => void;
  /** Back to the guide sheet, to type instead. */
  readonly onClose: () => void;
  readonly onOpenSettings?: () => void;
}

const useStyles = makeStyles((t) => ({
  stage: { flex: 1, backgroundColor: t.color.ink['930'] },
  // Over the camera or the still, as in the render.
  pills: {
    position: 'absolute',
    top: t.space['12'],
    start: t.size.gutter,
    end: t.size.gutter,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  menu: {
    paddingHorizontal: t.size.gutter,
    paddingTop: t.space['32'] * 2,
    paddingBottom: t.size.gutter,
    flexGrow: 1,
    justifyContent: 'center',
  },
  fill: { flex: 1 },
  panel: {
    backgroundColor: t.semantic.bg.raised,
    borderTopLeftRadius: t.radius.lg,
    borderTopRightRadius: t.radius.lg,
    paddingTop: t.space['20'],
    paddingBottom: t.space['12'],
    gap: t.space['16'],
  },
  inset: { paddingHorizontal: t.size.gutter },
  line: { flex: 1 },
  actions: { gap: t.space['8'], paddingHorizontal: t.size.gutter },
  action: {
    minHeight: sizeToken(t.size.chip, 'hitTarget'),
    borderRadius: sizeToken(t.size.chip, 'hitTarget') / 2,
    paddingHorizontal: t.space['14'],
    backgroundColor: t.semantic.bg.control,
    justifyContent: 'center',
  },
  composer: { paddingHorizontal: t.space['12'] },
}));

export function CameraView(props: CameraViewProps) {
  const { state } = props;
  const styles = useStyles();
  const theme = useTheme();
  const { t, i18n } = useLingui();
  const [draft, setDraft] = useState('');
  const issue = useIssueLine(state.issue, props.guideName);
  const stickers = menuStickers(state.lines, state.reading);
  const aiming = state.phase === 'aiming' || state.phase === 'capturing';
  const cannotScan = state.issue === 'no_camera' || state.issue === 'camera_denied';
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
  const ordering = state.phase === 'result' && state.reading !== null && props.order !== undefined;
  const ask = () => {
    const question = draft.trim();
    if (question === '') return;
    setDraft('');
    props.onAsk(question);
  };

  return (
    <Scaffold edges={['top', 'bottom']} testID="guide-camera">
      <View style={styles.stage}>
        {aiming ? <View style={styles.fill}>{props.camera}</View> : null}
        {aiming || state.still === null ? null : (
          <ScrollView contentContainerStyle={styles.menu}>
            <MenuStickers still={state.still} stickers={stickers}>
              {props.still}
            </MenuStickers>
          </ScrollView>
        )}
        <Row style={styles.pills} pointerEvents="none">
          <Tag
            label={t({ id: 'guide.camera.title', message: 'Point and ask' })}
            color={theme.semantic.action.primary}
          />
          {state.phase !== 'result' || !props.languages ? null : (
            <View testID="guide-camera-languages">
              <Tag
                label={upper(props.languages, i18n.locale)}
                color={theme.semantic.bg.raised}
                textColor={theme.semantic.text.primary}
              />
            </View>
          )}
        </Row>
      </View>
      <View style={styles.panel}>
        <Stack gap="12" style={styles.inset}>
          <Row gap="12" align="flex-start">
            {props.sticker}
            <Text
              variant="voice"
              color={theme.color.yellow}
              style={styles.line}
              accessibilityLiveRegion="polite"
              testID={
                state.issue === null
                  ? `guide-camera-line-${state.phase}`
                  : `guide-camera-issue-${state.issue}`
              }
            >
              {line}
            </Text>
          </Row>
          {showsFlags(state.reading) ? (
            <Text
              variant="caption"
              color={theme.semantic.text.secondary}
              testID="guide-camera-caution"
            >
              {t({
                id: 'guide.camera.caution',
                message: 'Flags are a guide, not medical advice. Ask staff about allergies.',
              })}
            </Text>
          ) : null}
          {state.issue === 'camera_denied' ? (
            <PermissionCard
              title={t({ id: 'guide.camera.deniedTitle', message: 'The camera is off' })}
              body={t({
                id: 'guide.camera.deniedBody',
                message: `${props.guideName} can't see the menu without the camera. Turn it on in Settings, or type a dish name in the chat.`,
              })}
              fallback={{
                label: t({ id: 'guide.voice.typeInstead', message: 'Type instead' }),
                onPress: props.onClose,
              }}
              {...(props.onOpenSettings ? { onOpenSettings: props.onOpenSettings } : {})}
              testID="guide-camera-denied"
            />
          ) : null}
          {state.issue === 'no_camera' ? (
            <TextLink
              label={t({ id: 'guide.voice.typeInstead', message: 'Type instead' })}
              onPress={props.onClose}
              testID="guide-camera-type"
            />
          ) : null}
        </Stack>
        {ordering ? <View style={styles.inset}>{props.order}</View> : null}
        {!ordering &&
        state.phase === 'result' &&
        state.reading !== null &&
        props.followUps.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.actions}
            testID="guide-camera-follow-ups"
          >
            {props.followUps.map((action) => (
              <PressScale
                key={action.id}
                accessibilityLabel={action.label}
                onPress={action.onPress}
                widthClass="narrow"
                style={styles.action}
                testID={`guide-camera-follow-${action.id}`}
              >
                <Text variant="buttonSm">{upper(action.label, i18n.locale)}</Text>
              </PressScale>
            ))}
          </ScrollView>
        ) : null}
        {ordering ? null : state.phase === 'result' ? (
          <Stack gap="8">
            {state.reading === null ? null : (
              <View style={styles.composer}>
                <Composer
                  value={draft}
                  onChangeText={setDraft}
                  onSend={ask}
                  placeholder={t({
                    id: 'guide.camera.askPlaceholder',
                    message: 'Ask about this menu',
                  })}
                  {...(props.onMic === undefined ? {} : { onMicTap: props.onMic })}
                  onRaised
                  testID="guide-camera-composer"
                />
              </View>
            )}
            <View style={styles.inset}>
              <TextLink
                label={t({ id: 'guide.camera.retake', message: 'Read another menu' })}
                onPress={props.onRetake}
                testID="guide-camera-retake"
              />
            </View>
          </Stack>
        ) : cannotScan ? null : (
          <View style={styles.inset}>
            <PillButton
              label={t({ id: 'guide.camera.scan', message: 'Read this menu' })}
              onPress={props.onScan}
              loading={state.phase !== 'aiming'}
              disabled={state.phase !== 'aiming'}
              testID="guide-camera-scan"
            />
          </View>
        )}
      </View>
    </Scaffold>
  );
}
