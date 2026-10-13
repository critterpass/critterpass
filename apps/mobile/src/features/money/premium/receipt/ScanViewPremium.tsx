/**
 * The scan in the premium look (7.19, 7.20 and the undesigned steps around them): aiming (scan,
 * pick a photo, or type it in), the camera refused, reading and waiting under the sweep, a photo
 * that would not open, a receipt that could not be read, saved offline or not uploaded, the
 * itemised review and the three ways forward. Pure: the screen hands it the step.
 */
import { useLingui } from '@lingui/react/macro';
import type { ReactNode } from 'react';
import { StatusBar, StyleSheet, View } from 'react-native';

import { useWalletGuide } from '@/features/bookings';
import { guideCritterKind } from '@/features/trip';
import { Button, GuideNote, PREMIUM_THEMES, Text, TextButton } from '@/ui/premium';

import type { ScanViewProps } from '../../receipt/view-types';
import { ReceiptFailure, ReceiptReview } from './ScanPanels';
import { ScanSheet } from './scan-sheet';
import { ScanStagePremium } from './ScanStagePremium';

function Heading({ title, line }: { readonly title: string; readonly line: string }) {
  return (
    <View style={styles.heading}>
      <Text variant="title" accessibilityRole="header">
        {title}
      </Text>
      <Text variant="body" tone="inkSecondary">
        {line}
      </Text>
    </View>
  );
}

export function ScanViewPremium(props: ScanViewProps) {
  const { t } = useLingui();
  const guide = useWalletGuide();
  const guideName = guide.name;
  const critter = guideCritterKind(guide.id);
  const { scene } = props;
  const issue = scene.kind === 'failure' ? scene.failure.issue : null;
  const issueText =
    issue === 'crumpled'
      ? t({ id: 'money.scan.crumpled', message: 'Too crumpled' })
      : issue === 'blurry'
        ? t({ id: 'money.scan.blurry', message: 'Too blurry' })
        : issue === 'glare'
          ? t({ id: 'money.scan.glare', message: 'Glare' })
          : issue === 'cut_off'
            ? t({ id: 'money.scan.cutOff', message: 'Cut off' })
            : null;
  const chipText =
    scene.kind === 'failure'
      ? null
      : props.autoSplit
        ? t({ id: 'money.scan.autoOn', message: 'Auto-split on' })
        : t({ id: 'money.scan.autoOff', message: 'Auto-split off' });
  const pickLabel = t({ id: 'money.scan.pick', message: 'Pick a photo' });
  const typeIt = t({ id: 'money.scan.typeIt', message: 'Type it in' });
  const scanButtons = (
    <>
      <Button
        label={t({ id: 'money.scan.scan', message: 'Scan the receipt' })}
        onPress={props.onScan}
        testID="money-scan-start"
      />
      <Button
        label={pickLabel}
        variant="secondary"
        onPress={props.onPick}
        testID="money-scan-pick"
      />
      <TextButton
        label={t({ id: 'money.scan.typeInstead', message: 'Type it in instead' })}
        align="center"
        onPress={props.onType}
        testID="money-scan-type"
      />
    </>
  );

  let panel: ReactNode;
  if (scene.kind === 'aim') {
    panel = <ScanSheet testID="money-scan-aim">{scanButtons}</ScanSheet>;
  } else if (scene.kind === 'denied') {
    panel = (
      <ScanSheet testID="money-scan-denied">
        <GuideNote
          name={guideName}
          critter={critter}
          text={t({
            id: 'money.scan.deniedLine',
            message: 'I need the camera to read receipts. A photo from your library works too.',
          })}
        />
        <Button
          label={t({ id: 'money.scan.settings', message: 'Open Settings' })}
          onPress={props.onSettings}
          testID="money-scan-settings"
        />
        <Button label={pickLabel} variant="secondary" onPress={props.onPick} />
      </ScanSheet>
    );
  } else if (scene.kind === 'reading') {
    panel = (
      <ScanSheet testID="money-scan-reading">
        <GuideNote
          name={guideName}
          critter={critter}
          text={
            scene.waiting
              ? t({ id: 'money.scan.waiting', message: 'Adding it up. Who had what comes next.' })
              : t({ id: 'money.scan.reading', message: 'Reading the lines…' })
          }
        />
        {scene.slow === true ? (
          <>
            <Text variant="body" tone="inkSecondary" testID="money-scan-slow">
              {t({
                id: 'money.scan.slowLine',
                message: 'This is taking longer than usual. Keep waiting, or type it in.',
              })}
            </Text>
            <Button
              label={typeIt}
              variant="secondary"
              onPress={props.onType}
              testID="money-scan-slow-type"
            />
          </>
        ) : null}
      </ScanSheet>
    );
  } else if (scene.kind === 'pick_failed') {
    panel = (
      <ScanSheet testID="money-scan-pick_failed">
        <Heading
          title={t({ id: 'money.scan.pickFailedTitle', message: "Couldn't open that photo" })}
          line={t({
            id: 'money.scan.pickFailedLine',
            message: 'Scan the receipt, pick another photo, or type it in. Nothing was added.',
          })}
        />
        {scanButtons}
      </ScanSheet>
    );
  } else if (scene.kind === 'unreadable') {
    panel = (
      <ScanSheet testID="money-scan-unreadable">
        <Heading
          title={t({ id: 'money.scan.unreadableTitle', message: "Couldn't read that one" })}
          line={t({
            id: 'money.scan.unreadableLine',
            message: 'Type it in, or retake it flat and in good light. Nothing was added.',
          })}
        />
        <Button label={typeIt} onPress={props.onType} testID="money-scan-unreadable-type" />
        <Button
          label={t({ id: 'money.scan.retake', message: 'Retake' })}
          variant="secondary"
          onPress={props.onRetake}
          testID="money-scan-retake"
        />
      </ScanSheet>
    );
  } else if (scene.kind === 'offline') {
    panel = (
      <ScanSheet testID="money-scan-offline">
        <Heading
          title={t({ id: 'money.scan.savedTitle', message: 'Saved' })}
          line={t({
            id: 'money.scan.savedLine',
            message: `${guideName} reads it when you're back online. You can close this.`,
          })}
        />
        <Button
          label={t({ id: 'money.scan.done', message: 'Done' })}
          onPress={props.onClose}
          testID="money-scan-done"
        />
      </ScanSheet>
    );
  } else if (scene.kind === 'upload_failed') {
    panel = (
      <ScanSheet testID="money-scan-upload_failed">
        <Heading
          title={t({ id: 'money.scan.failedTitle', message: "That didn't upload" })}
          line={t({
            id: 'money.scan.failedLine',
            message: 'Try again, or type it in. Nothing was added.',
          })}
        />
        {scanButtons}
      </ScanSheet>
    );
  } else if (scene.kind === 'review') {
    panel = <ReceiptReview {...scene.review} />;
  } else {
    panel = <ReceiptFailure {...scene.failure} />;
  }

  const onPhoto = PREMIUM_THEMES.dark.color;
  return (
    <>
      <StatusBar barStyle="light-content" animated />
      <ScanStagePremium
        chip={chipText}
        onChip={scene.kind === 'aim' ? props.onAutoSplit : undefined}
        issue={issueText}
        onClose={props.onClose}
        photo={props.photo}
        lines={props.lines}
        sweeping={scene.kind === 'reading' || scene.kind === 'failure'}
        stutter={scene.kind === 'failure'}
        empty={
          <View style={styles.aim} testID="money-scan-hint">
            <Text variant="title" color={onPhoto.ink} align="center">
              {t({ id: 'money.scan.aimTitle', message: 'Lay the receipt flat' })}
            </Text>
            <Text variant="body" color={onPhoto.inkSecondary} align="center">
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
    </>
  );
}

const styles = StyleSheet.create({
  heading: { gap: 6 },
  aim: { alignItems: 'center', gap: 8 },
});
