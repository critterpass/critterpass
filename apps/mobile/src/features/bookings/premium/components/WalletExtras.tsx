/**
 * The foot of the premium wallet: mail held until its sender is linked, travel insurance (open the
 * card, or add one) and past bookings.
 */
import { plural } from '@lingui/core/macro';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { View } from 'react-native';

import { IconTile } from '@/features/trip';
import { Banner, Icon, ListCard, Row, usePremiumTheme } from '@/ui/premium';

import { BOOKINGS_ROUTES } from '../../routes';
import type { WalletScreenData } from '../../stack/use-wallet-screen';

export function WalletExtras({ data }: { readonly data: WalletScreenData }) {
  const th = usePremiumTheme();
  const { t } = useLingui();
  const { heldMail, heldMailCodeSent } = data.context;
  const count = heldMail;
  const policy = data.insurance.policy;
  const past = data.wallet.past.length;
  const chevron = <Icon name="forward" size={14} color={th.color.outlineEmpty} />;
  return (
    <View style={{ paddingHorizontal: th.space.gap16, gap: th.space.gap12 }}>
      {heldMail > 0 ? (
        <Banner
          tone="info"
          text={`${t({
            id: 'bookings.heldMail.title',
            message: plural(count, { one: 'Mail is waiting', other: '# emails are waiting' }),
          })}. ${
            heldMailCodeSent
              ? t({
                  id: 'bookings.heldMail.line',
                  message:
                    'We emailed the address it came from a 6-digit code. Enter it to link that address and read the mail.',
                })
              : t({
                  id: 'bookings.heldMail.noCodeLine',
                  message:
                    'No code went out for this mail, so it can’t be read yet. Paste the email here, or forward it again from the address you sign in with.',
                })
          }`}
          action={
            heldMailCodeSent
              ? {
                  label: t({ id: 'bookings.heldMail.enter', message: 'Enter the code' }),
                  onPress: () => router.push(BOOKINGS_ROUTES.linkCode),
                }
              : {
                  label: t({ id: 'bookings.heldMail.paste', message: 'Paste the email' }),
                  onPress: () => router.push(BOOKINGS_ROUTES.paste),
                }
          }
          testID="bookings-held-mail"
        />
      ) : null}
      {data.insurance.loaded || past > 0 ? (
        <ListCard radius={th.radius.cardRow}>
          {data.insurance.loaded ? (
            <Row
              title={
                policy === null
                  ? t({ id: 'bookings.insurance.add', message: 'Add travel insurance' })
                  : t({ id: 'bookings.insurance.eyebrow', message: 'Travel insurance' })
              }
              {...(policy === null ? {} : { subtitle: policy.provider })}
              leading={
                <IconTile
                  name="shield"
                  bg={th.color.status.booked.bg}
                  color={th.color.status.booked.text}
                />
              }
              trailing={chevron}
              onPress={() => router.push(BOOKINGS_ROUTES.insurance)}
              testID={policy === null ? 'bookings-insurance-add' : 'bookings-insurance-card'}
            />
          ) : null}
          {past > 0 ? (
            <Row
              title={t({
                id: 'bookings.archive.link',
                message: plural(Math.max(0, past), {
                  one: '# past booking',
                  other: '# past bookings',
                }),
              })}
              leading={<IconTile name="clock" bg={th.color.control} color={th.color.ink} />}
              trailing={chevron}
              onPress={() => router.push(BOOKINGS_ROUTES.archive)}
              testID="bookings-archive-link"
            />
          ) : null}
        </ListCard>
      ) : null}
    </View>
  );
}
