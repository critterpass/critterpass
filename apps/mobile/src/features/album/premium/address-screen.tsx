/**
 * The traveller's own postal address for printed postcards, in the premium look (undesigned; a
 * pushed form from the kit's fields): why it is asked and who sees it, the fields with what each
 * still needs, the country row opening the picker, removing a saved address (asked first), and
 * Save on the keyboard's edge. Saving needs a connection; the page says so while there is none.
 */
/* eslint-disable lingui/no-unlocalized-strings -- field keys and input settings, never copy. */
import { t } from '@lingui/core/macro';
import type { TextInputProps } from 'react-native';
import { View } from 'react-native';

import {
  Banner,
  Button,
  ListCard,
  Row,
  Text,
  TextButton,
  TextField,
  usePremiumTheme,
} from '@/ui/premium';
import {
  confirmAlert,
  KeyboardAwareScroll,
  KeyboardStickyFooter,
  PushScreen,
} from '@/ui/premium/shell';

import type { AddressDraft } from '../mailing/address-form';
import { useAddressScreen } from '../mailing/use-address-screen';
import { PremiumCountrySheet } from './country-sheet';

export function PremiumAddressScreen() {
  const th = usePremiumTheme();
  const form = useAddressScreen();
  const field = (key: keyof AddressDraft, label: string, extra: Partial<TextInputProps> = {}) => (
    <View style={{ gap: 6 }}>
      <Text variant="label" tone="muted" style={{ marginLeft: 6 }}>
        {label}
      </Text>
      <TextField
        value={form.draft[key]}
        onChangeText={form.set(key)}
        accessibilityLabel={label}
        error={form.say(form.problems[key])}
        testID={`album-address-${key}`}
        {...extra}
      />
    </View>
  );
  const countryProblem = form.say(form.problems.country);
  const remove = async () => {
    const yes = await confirmAlert({
      title: t({ id: 'album.address.removeTitle', message: 'Remove your address?' }),
      message: t({
        id: 'album.address.removeLine',
        message: 'Your crew can no longer mail you printed postcards.',
      }),
      confirm: t({ id: 'album.address.removeConfirm', message: 'Remove' }),
      cancel: t({ id: 'album.premium.address.keep', message: 'Keep it' }),
    });
    if (yes) form.onRemove();
  };
  return (
    <PushScreen
      title={t({ id: 'album.address.title', message: 'Your address' })}
      backLabel={t({ id: 'album.address.back', message: 'Back' })}
      scroll={false}
      testID="album-address"
    >
      <KeyboardAwareScroll
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ padding: th.space.gutter, gap: 14, paddingBottom: 120 }}
      >
        <Text variant="rowText" tone="inkSecondary" singleLine={false}>
          {form.saved
            ? t({
                id: 'album.address.savedIn',
                message: `You have an address saved (${form.savedCountry}). Your crew can mail you a printed postcard. They never see the address. Fill the form again to change it.`,
              })
            : t({
                id: 'album.address.why',
                message:
                  'For printed postcards from your crew. Only the printer sees it; your crew and the guide never do.',
              })}
        </Text>
        {form.online ? null : (
          <Banner
            tone="info"
            text={t({
              id: 'album.address.offlineLine',
              message:
                "No signal. We can't show whether your address is saved, and saving needs a connection.",
            })}
            testID="album-address-offline"
          />
        )}
        {field('name', t({ id: 'album.address.name', message: 'Name on the card' }), {
          autoComplete: 'name',
          textContentType: 'name',
        })}
        {field('line1', t({ id: 'album.address.line1', message: 'Street and number' }), {
          autoComplete: 'address-line1',
          textContentType: 'streetAddressLine1',
        })}
        {field('line2', t({ id: 'album.address.line2', message: 'Flat, floor (optional)' }), {
          autoComplete: 'address-line2',
          textContentType: 'streetAddressLine2',
        })}
        {field('city', t({ id: 'album.address.city', message: 'City' }), {
          textContentType: 'addressCity',
        })}
        {field(
          'region',
          t({ id: 'album.address.region', message: 'State or province (optional)' }),
          {
            textContentType: 'addressState',
          },
        )}
        {field('postal_code', t({ id: 'album.address.postal', message: 'Postcode' }), {
          autoComplete: 'postal-code',
          textContentType: 'postalCode',
        })}
        <ListCard>
          <Row
            title={
              form.countryName ??
              t({ id: 'album.address.countryPick', message: 'Choose the country' })
            }
            subtitle={t({ id: 'album.address.countryLabel', message: 'Country' })}
            onPress={() => form.setPicking(true)}
            testID="album-address-country"
          />
        </ListCard>
        {countryProblem === undefined ? null : (
          <Text
            variant="helper"
            color={th.color.destructive.helper}
            testID="album-address-country-problem"
          >
            {countryProblem}
          </Text>
        )}
        {form.saved ? (
          <TextButton
            label={t({ id: 'album.address.remove', message: 'Remove my address' })}
            onPress={() => void remove()}
            disabled={form.pending}
            color={th.color.destructive.listAction}
            testID="album-address-remove"
          />
        ) : null}
      </KeyboardAwareScroll>
      <KeyboardStickyFooter style={{ paddingHorizontal: th.space.gutter, paddingBottom: 12 }}>
        <Button
          label={t({ id: 'album.address.save', message: 'Save address' })}
          onPress={form.onSave}
          loading={form.pending}
          testID="album-address-save"
        />
      </KeyboardStickyFooter>
      {form.picking ? (
        <PremiumCountrySheet onPick={form.pickCountry} onClose={() => form.setPicking(false)} />
      ) : null}
    </PushScreen>
  );
}
