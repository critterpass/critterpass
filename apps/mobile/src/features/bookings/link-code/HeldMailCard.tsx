/**
 * "Mail is waiting" (undesigned, logged in docs/undesigned-states.md): the crew address is holding
 * forwarded mail from an address nobody in the crew has linked yet (the count syncs on the crew's
 * address row; nothing about the mail itself reaches the phone). When a code was emailed to that
 * address (`codeSent`), one line on what to do and ENTER THE CODE, which opens the link-code sheet.
 * When none went out (Cloudflare refused the reply, or it has expired), the card says so and offers
 * what works now: PASTE THE EMAIL opens the paste sheet, or forward it again from the sign-in
 * address. Shown on the wallet and on Add a booking.
 */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { upper } from '@cp/i18n';

import { useLocale } from '@/lib/i18n/use-locale';
import { PillButton } from '@/ui/buttons/PillButton';
import { Card } from '@/ui/cards/Card';
import { Stack } from '@/ui/layout/Stack';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

export function HeldMailCard({
  count,
  codeSent,
  onLink,
  onPaste,
}: {
  readonly count: number;
  readonly codeSent: boolean;
  readonly onLink: () => void;
  readonly onPaste: () => void;
}) {
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  return (
    <Card testID={codeSent ? 'bookings-held-mail' : 'bookings-held-mail-no-code'}>
      <Stack gap="10">
        <Text variant="eyebrow">
          {upper(
            t({
              id: 'bookings.heldMail.title',
              message: plural(count, { one: 'Mail is waiting', other: '# emails are waiting' }),
            }),
            locale,
          )}
        </Text>
        <Text variant="body" color={theme.semantic.text.secondary}>
          {codeSent
            ? t({
                id: 'bookings.heldMail.line',
                message:
                  'We emailed the address it came from a 6-digit code. Enter it to link that address and read the mail.',
              })
            : t({
                id: 'bookings.heldMail.noCodeLine',
                message:
                  'No code went out for this mail, so it can’t be read yet. Paste the email here, or forward it again from the address you sign in with.',
              })}
        </Text>
        {codeSent ? (
          <PillButton
            label={t({ id: 'bookings.heldMail.enter', message: 'Enter the code' })}
            onPress={onLink}
            size="sm"
            testID="bookings-held-mail-enter"
          />
        ) : (
          <PillButton
            label={t({ id: 'bookings.heldMail.paste', message: 'Paste the email' })}
            onPress={onPaste}
            size="sm"
            testID="bookings-held-mail-paste"
          />
        )}
      </Stack>
    </Card>
  );
}
