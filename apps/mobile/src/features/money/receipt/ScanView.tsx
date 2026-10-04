/**
 * The scan screen for each step (3i-3, 3i-4 and the undesigned steps around them): aiming (scan,
 * pick a photo, or type it in), the camera refused, reading and waiting under the sweep, saved
 * offline, the itemised review, and the three ways forward. Pure: the screen hands it the step.
 */
import { upper } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useLocale } from '@/lib/i18n/use-locale';
import { guideSticker } from '@/ui/avatar/guides';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { GuideLine } from '@/ui/people/GuideLine';
import { useBackAffordance } from '@/ui/qa/back-affordance';
import { Stack } from '@/ui/layout/Stack';
import { Sticker } from '@/ui/sticker/Sticker';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';
import { useWalletGuide } from '@/features/bookings';

import { FailureSheet, type FailureSheetProps } from './FailureSheet';
import { LineAssignSheet, type LineAssignSheetProps } from './LineAssignSheet';
import { ScanCamera } from './ScanCamera';
import type { SweepLine } from './ScanSweep';

const useStyles = makeStyles((t) => ({
  panel: {
    backgroundColor: t.semantic.bg.base,
    borderTopStartRadius: t.radius.sheetTop,
    borderTopEndRadius: t.radius.sheetTop,
    paddingHorizontal: t.size.gutter,
    paddingTop: t.space['20'],
    gap: t.space['12'],
  },
  aim: { alignItems: 'center', gap: t.space['8'] },
}));

export type ScanScene =
  | { readonly kind: 'aim' }
  | { readonly kind: 'denied' }
  | { readonly kind: 'reading'; readonly waiting: boolean; readonly slow?: boolean }
  | { readonly kind: 'offline' }
  | { readonly kind: 'upload_failed' }
  | { readonly kind: 'pick_failed' }
  /** The server could not read it: the manual paths, said plainly. */
  | { readonly kind: 'unreadable' }
  | { readonly kind: 'review'; readonly review: LineAssignSheetProps }
  | { readonly kind: 'failure'; readonly failure: FailureSheetProps };

export interface ScanViewProps {
  readonly scene: ScanScene;
  readonly autoSplit: boolean;
  readonly photo: ReactNode | null;
  readonly lines: readonly SweepLine[];
  readonly onAutoSplit: () => void;
  readonly onClose: () => void;
  readonly onScan: () => void;
  readonly onPick: () => void;
  readonly onType: () => void;
  readonly onRetake: () => void;
  readonly onSettings: () => void;
}

function Panel({ children, testID }: { readonly children: ReactNode; readonly testID: string }) {
  const styles = useStyles();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[styles.panel, { paddingBottom: insets.bottom + theme.space['8'] }]}
      testID={testID}
    >
      {children}
    </View>
  );
}

export function ScanView(props: ScanViewProps) {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  const { name: guideName } = useWalletGuide();
  const guide = useWalletGuide();
  const tokek = guideSticker(guide.id);
  const { scene } = props;
  // The camera's ✕ is drawn in every scene, so the screen always has its way back.
  useBackAffordance();
  const issue = scene.kind === 'failure' ? scene.failure.issue : null;
  const chipText =
    issue === 'crumpled'
      ? t({ id: 'money.scan.crumpled', message: 'Too crumpled' })
      : issue === 'blurry'
        ? t({ id: 'money.scan.blurry', message: 'Too blurry' })
        : issue === 'glare'
          ? t({ id: 'money.scan.glare', message: 'Glare' })
          : issue === 'cut_off'
            ? t({ id: 'money.scan.cutOff', message: 'Cut off' })
            : props.autoSplit
              ? t({ id: 'money.scan.autoOn', message: 'Auto-split on' })
              : t({ id: 'money.scan.autoOff', message: 'Auto-split off' });
  const scanButtons = (
    <>
      <PillButton
        label={upper(t({ id: 'money.scan.scan', message: 'Scan the receipt' }), locale)}
        onPress={props.onScan}
        block
        testID="money-scan-start"
      />
      <PillButton
        label={upper(t({ id: 'money.scan.pick', message: 'Pick a photo' }), locale)}
        onPress={props.onPick}
        variant="secondary"
        block
        testID="money-scan-pick"
      />
      <TextLink
        label={t({ id: 'money.scan.typeInstead', message: 'Type it in instead' })}
        onPress={props.onType}
        testID="money-scan-type"
      />
    </>
  );

  let panel: ReactNode;
  if (scene.kind === 'aim') {
    panel = <Panel testID="money-scan-aim">{scanButtons}</Panel>;
  } else if (scene.kind === 'denied') {
    panel = (
      <Panel testID="money-scan-denied">
        <GuideLine
          guide={guide.id}
          name={guide.name}
          sticker={<Sticker kind={tokek.kind} name={guide.name} size={44} pose="think" />}
          line={t({
            id: 'money.scan.deniedLine',
            message: 'I need the camera to read receipts. A photo from your library works too.',
          })}
        />
        <PillButton
          label={upper(t({ id: 'money.scan.settings', message: 'Open Settings' }), locale)}
          onPress={props.onSettings}
          block
          testID="money-scan-settings"
        />
        <PillButton
          label={upper(t({ id: 'money.scan.pick', message: 'Pick a photo' }), locale)}
          onPress={props.onPick}
          variant="secondary"
          block
        />
      </Panel>
    );
  } else if (scene.kind === 'reading') {
    panel = (
      <Panel testID="money-scan-reading">
        <GuideLine
          guide={guide.id}
          name={guide.name}
          sticker={<Sticker kind={tokek.kind} name={guide.name} size={44} pose="point" />}
          line={
            scene.waiting
              ? t({ id: 'money.scan.waiting', message: 'Adding it up. Who had what comes next.' })
              : t({ id: 'money.scan.reading', message: 'Reading the lines…' })
          }
        />
        {scene.slow === true ? (
          <>
            <Text variant="body" color={theme.semantic.text.secondary} testID="money-scan-slow">
              {t({
                id: 'money.scan.slowLine',
                message: 'This is taking longer than usual. Keep waiting, or type it in.',
              })}
            </Text>
            <PillButton
              label={upper(t({ id: 'money.scan.typeIt', message: 'Type it in' }), locale)}
              onPress={props.onType}
              variant="secondary"
              block
              testID="money-scan-slow-type"
            />
          </>
        ) : null}
      </Panel>
    );
  } else if (scene.kind === 'pick_failed') {
    panel = (
      <Panel testID="money-scan-pick_failed">
        <Stack gap="8">
          <Text variant="h3" accessibilityRole="header">
            {t({ id: 'money.scan.pickFailedTitle', message: "Couldn't open that photo" })}
          </Text>
          <Text variant="body" color={theme.semantic.text.secondary}>
            {t({
              id: 'money.scan.pickFailedLine',
              message: 'Scan the receipt, pick another photo, or type it in. Nothing was added.',
            })}
          </Text>
        </Stack>
        {scanButtons}
      </Panel>
    );
  } else if (scene.kind === 'unreadable') {
    panel = (
      <Panel testID="money-scan-unreadable">
        <Stack gap="8">
          <Text variant="h3" accessibilityRole="header">
            {t({ id: 'money.scan.unreadableTitle', message: "Couldn't read that one" })}
          </Text>
          <Text variant="body" color={theme.semantic.text.secondary}>
            {t({
              id: 'money.scan.unreadableLine',
              message: 'Type it in, or retake it flat and in good light. Nothing was added.',
            })}
          </Text>
        </Stack>
        <PillButton
          label={upper(t({ id: 'money.scan.typeIt', message: 'Type it in' }), locale)}
          onPress={props.onType}
          block
          testID="money-scan-unreadable-type"
        />
        <PillButton
          label={upper(t({ id: 'money.scan.retake', message: 'Retake' }), locale)}
          onPress={props.onRetake}
          variant="secondary"
          block
          testID="money-scan-retake"
        />
      </Panel>
    );
  } else if (scene.kind === 'offline' || scene.kind === 'upload_failed') {
    panel = (
      <Panel testID={`money-scan-${scene.kind}`}>
        <Stack gap="8">
          <Text variant="h3" accessibilityRole="header">
            {scene.kind === 'offline'
              ? t({ id: 'money.scan.savedTitle', message: 'Saved' })
              : t({ id: 'money.scan.failedTitle', message: "That didn't upload" })}
          </Text>
          <Text variant="body" color={theme.semantic.text.secondary}>
            {scene.kind === 'offline'
              ? t({
                  id: 'money.scan.savedLine',
                  message: `${guideName} reads it when you're back online. You can close this.`,
                })
              : t({
                  id: 'money.scan.failedLine',
                  message: 'Try again, or type it in. Nothing was added.',
                })}
          </Text>
        </Stack>
        {scene.kind === 'offline' ? (
          <PillButton
            label={upper(t({ id: 'money.scan.done', message: 'Done' }), locale)}
            onPress={props.onClose}
            block
            testID="money-scan-done"
          />
        ) : (
          scanButtons
        )}
      </Panel>
    );
  } else if (scene.kind === 'review') {
    panel = <LineAssignSheet {...scene.review} />;
  } else {
    panel = <FailureSheet {...scene.failure} />;
  }

  return (
    <ScanCamera
      chip={{ label: upper(chipText, locale), tone: issue === null ? 'green' : 'pink' }}
      onChip={scene.kind === 'aim' ? props.onAutoSplit : undefined}
      onClose={props.onClose}
      photo={props.photo}
      lines={props.lines}
      sweeping={scene.kind === 'reading' || scene.kind === 'failure'}
      stutter={scene.kind === 'failure'}
      empty={
        <View style={styles.aim} testID="money-scan-hint">
          <Text variant="h3" color={theme.color.paper.base}>
            {t({ id: 'money.scan.aimTitle', message: 'Lay the receipt flat' })}
          </Text>
          <Text variant="body" color={theme.color.paper.base} style={{ textAlign: 'center' }}>
            {t({
              id: 'money.scan.aimLine',
              message: `${guideName} snaps it when the paper is flat and still, then reads every line.`,
            })}
          </Text>
        </View>
      }
      panel={panel}
      testID="money-scan"
    />
  );
}
