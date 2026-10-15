/**
 * The visit detection consent in the premium look (undesigned; built from the kit's sheet, sticker
 * and buttons): what is kept (the places, not the path), what for, and for how long. Nothing is
 * detected until the traveller turns it on here or in Settings.
 */
import { t } from '@lingui/core/macro';

import { Button, CritterSticker, Text, TextButton } from '@/ui/premium';
import { ModalSheet } from '@/ui/premium/shell/screens/modal-sheet';
import { guideSticker } from '@/ui/premium/stickers/guides';

export interface VisitConsentSheetProps {
  readonly onAnswer: (granted: boolean) => void;
}

export function VisitConsentSheet({ onAnswer }: VisitConsentSheetProps) {
  const guide = guideSticker(null);
  const title = t({ id: 'permissions.visits.title', message: 'Remember places you visit' });
  return (
    <ModalSheet
      onDismiss={() => onAnswer(false)}
      accessibilityLabel={title}
      testID="visit-consent-sheet"
      footer={
        <>
          <Button
            label={t({ id: 'permissions.visits.accept', message: 'Turn on' })}
            onPress={() => onAnswer(true)}
            testID="visit-consent-accept"
          />
          <TextButton
            label={t({ id: 'permissions.sheet.notNow', message: 'Not now' })}
            align="center"
            onPress={() => onAnswer(false)}
            testID="visit-consent-decline"
          />
        </>
      }
    >
      <CritterSticker kind={guide.kind} name={guide.name} size={96} />
      <Text variant="title" align="center" accessibilityRole="header">
        {title}
      </Text>
      <Text variant="body" align="center">
        {t({
          id: 'permissions.visits.bodyReached',
          message:
            'The places on your plan that you actually reach, never a trail of coordinates. They power quests, awards and your trip rating, and are deleted 30 days after the trip ends.',
        })}
      </Text>
      <Text variant="rowText" tone="muted" align="center">
        {t({
          id: 'permissions.visits.control',
          message: 'Turn it off any time in Settings. Visits already saved stay deletable.',
        })}
      </Text>
    </ModalSheet>
  );
}
