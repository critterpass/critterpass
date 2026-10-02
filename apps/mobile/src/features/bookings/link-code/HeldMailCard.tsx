/**
 * "Mail is waiting" (undesigned, logged in docs/undesigned-states.md): the crew address is holding
 * forwarded mail from an address nobody in the crew has linked yet (the count syncs on the crew's
 * address row; nothing about the mail itself reaches the phone). One line on what to do and ENTER
 * THE CODE, which opens the link-code sheet. Shown on the wallet and on Add a booking.
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
  onLink,
}: {
  readonly count: number;
  readonly onLink: () => void;
}) {
  const theme = useTheme();
  const locale = useLocale();
  const { t } = useLingui();
  return (
    <Card testID="bookings-held-mail">
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
          {t({
            id: 'bookings.heldMail.line',
            message:
              'We emailed the address it came from a 6-digit code. Enter it to link that address and read the mail.',
          })}
        </Text>
        <PillButton
          label={t({ id: 'bookings.heldMail.enter', message: 'Enter the code' })}
          onPress={onLink}
          size="sm"
          testID="bookings-held-mail-enter"
        />
      </Stack>
    </Card>
  );
}
