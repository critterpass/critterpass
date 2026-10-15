/**
 * The just-in-time primer in the premium look (undesigned; built from the kit's sheet, sticker and
 * buttons): the guide, what the permission is for in plain words, "Turn on" before the OS prompt,
 * and after an OS refusal the way to Settings instead. Dismissing it counts as "not now". On
 * Android, background location shows Google Play's prominent disclosure first.
 */
import { t } from '@lingui/core/macro';
import { Platform } from 'react-native';

import type { PrimerAnswer, PrimerRequest } from '@/lib/permissions';
import { primerCopy } from '@/lib/permissions/primer-copy';
import { Button, CritterSticker, Text, TextButton } from '@/ui/premium';
import { ModalSheet } from '@/ui/premium/shell/screens/modal-sheet';

import { guideSticker } from '@/ui/premium/stickers/guides';

const ART = 96;

function GuideArt() {
  const guide = guideSticker(null);
  return <CritterSticker kind={guide.kind} name={guide.name} size={ART} />;
}

export interface PrimerSheetProps {
  readonly request: PrimerRequest;
  readonly onAnswer: (answer: PrimerAnswer) => void;
}

export function PrimerSheet({ request, onAnswer }: PrimerSheetProps) {
  const copy = primerCopy(request.kind, request.level === 'always');
  const settings = request.mode === 'settings';
  const disclosure = !settings && request.level === 'always' && Platform.OS === 'android';
  const decline = () => onAnswer('decline');
  if (disclosure) {
    return (
      <ModalSheet
        onDismiss={decline}
        accessibilityLabel={copy.title}
        testID="primer-sheet"
        footer={
          <>
            <Button
              label={t({ id: 'permissions.disclosure.continue', message: 'Continue' })}
              onPress={() => onAnswer('accept')}
              testID="background-location-disclosure-continue"
            />
            <TextButton
              label={t({ id: 'permissions.disclosure.decline', message: 'No thanks' })}
              align="center"
              onPress={decline}
              testID="background-location-disclosure-decline"
            />
          </>
        }
      >
        <GuideArt />
        <Text
          variant="title"
          align="center"
          accessibilityRole="header"
          testID="background-location-disclosure"
        >
          {t({ id: 'permissions.disclosure.title', message: 'Location in the background' })}
        </Text>
        <Text variant="body" align="center">
          {t({
            id: 'permissions.disclosure.body',
            message:
              'CritterPass collects location data to find critters near you, keep your crew map current and time your leave-by alerts, even when the app is closed or not in use.',
          })}
        </Text>
        <Text variant="rowText" tone="muted" align="center">
          {t({
            id: 'permissions.disclosure.limits',
            message:
              'Only on trip days, never at home. We keep the places you checked in at, never a trail of coordinates. Turn it off any time in Settings or from the trip-day notification.',
          })}
        </Text>
      </ModalSheet>
    );
  }
  return (
    <ModalSheet
      onDismiss={decline}
      accessibilityLabel={copy.title}
      testID="primer-sheet"
      footer={
        <>
          <Button
            label={
              settings
                ? t({ id: 'permissions.primer.openSettings', message: 'Open Settings' })
                : copy.action
            }
            onPress={() => onAnswer('accept')}
            testID="primer-sheet-accept"
          />
          <TextButton
            label={t({ id: 'permissions.sheet.notNow', message: 'Not now' })}
            align="center"
            onPress={decline}
            testID="primer-sheet-decline"
          />
        </>
      }
    >
      <GuideArt />
      <Text variant="title" align="center" accessibilityRole="header">
        {copy.title}
      </Text>
      <Text variant="body" align="center">
        {settings
          ? t({
              id: 'permissions.sheet.settingsBody',
              message: 'It is switched off in Settings. Turn it on there and come straight back.',
            })
          : copy.body}
      </Text>
    </ModalSheet>
  );
}
