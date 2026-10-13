/* eslint-disable lingui/no-unlocalized-strings -- field keys and input settings, never copy. */
/**
 * The traveller's own postal address for printed postcards (undesigned; a form from the app's
 * fields and its country picker), opened from the "add an address" request a crewmate's mailing
 * sends. Saving it is the consent to receive printed postcards from the crew; the address is
 * sealed on the server and never shown to the crew, the guide or a model. Removing it withdraws
 * the consent, and asks first. Each field says what it still needs; saving needs a connection and
 * the form says so while there is none.
 */
import { useLingui } from '@lingui/react/macro';

import { CountryPicker } from '@/features/onboarding';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { ListCard } from '@/ui/cards/ListCard';
import { SecondaryText } from '@/ui/cards/SecondaryText';
import { TextField } from '@/ui/inputs/TextField';
import { KeyboardFooter } from '@/ui/layout/KeyboardFooter';
import { KeyboardScrollView } from '@/ui/layout/KeyboardScrollView';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { LargeTitle } from '@/ui/shell/LargeTitle';
import { ConfirmSheet } from '@/ui/states/ConfirmSheet';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { useTheme } from '@/ui/theme';

import type { AddressDraft } from './address-form';
import { useAddressScreen } from './use-address-screen';

export function AddressScreen() {
  const { t } = useLingui();
  const theme = useTheme();
  const form = useAddressScreen();
  const { draft, problems, say, set, online, savedCountry, setPicking, setRemoving } = form;

  const field = (key: keyof AddressDraft, label: string, extra: object = {}) => {
    const message = say(problems[key]);
    return (
      <TextField
        label={label}
        value={draft[key]}
        onChangeText={set(key)}
        {...(message === undefined ? {} : { status: 'error' as const, message })}
        testID={`album-address-${key}`}
        {...extra}
      />
    );
  };
  const countryProblem = say(problems.country);

  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="album-address">
      <LargeTitle
        title={t({ id: 'album.address.title', message: 'Your address' })}
        start={<BackEyebrow label={t({ id: 'album.address.back', message: 'Back' })} />}
      />
      <KeyboardScrollView>
        <Stack gap="12" padding="16">
          <SecondaryText variant="body">
            {form.saved
              ? t({
                  id: 'album.address.savedIn',
                  message: `You have an address saved (${savedCountry}). Your crew can mail you a printed postcard. They never see the address. Fill the form again to change it.`,
                })
              : t({
                  id: 'album.address.why',
                  message:
                    'For printed postcards from your crew. Only the printer sees it; your crew and the guide never do.',
                })}
          </SecondaryText>
          {online ? null : (
            <Text
              variant="bodySm"
              color={theme.semantic.state.urgent}
              singleLine={false}
              testID="album-address-offline"
            >
              {t({
                id: 'album.address.offlineLine',
                message:
                  "No signal. We can't show whether your address is saved, and saving needs a connection.",
              })}
            </Text>
          )}
          {field('name', t({ id: 'album.address.name', message: 'Name on the card' }))}
          {field('line1', t({ id: 'album.address.line1', message: 'Street and number' }))}
          {field('line2', t({ id: 'album.address.line2', message: 'Flat, floor (optional)' }))}
          {field('city', t({ id: 'album.address.city', message: 'City' }))}
          {field(
            'region',
            t({ id: 'album.address.region', message: 'State or province (optional)' }),
          )}
          {field('postal_code', t({ id: 'album.address.postal', message: 'Postcode' }))}
          <ListCard
            title={
              form.countryName ??
              t({ id: 'album.address.countryPick', message: 'Choose the country' })
            }
            subtitle={t({ id: 'album.address.countryLabel', message: 'Country' })}
            chevron
            onPress={() => setPicking(true)}
            testID="album-address-country"
          />
          {countryProblem === undefined ? null : (
            <Text
              variant="bodySm"
              color={theme.semantic.state.urgent}
              testID="album-address-country-problem"
            >
              {countryProblem}
            </Text>
          )}
          {form.saved ? (
            <TextLink
              label={t({ id: 'album.address.remove', message: 'Remove my address' })}
              onPress={() => setRemoving(true)}
              disabled={form.pending}
              testID="album-address-remove"
            />
          ) : null}
        </Stack>
      </KeyboardScrollView>
      <KeyboardFooter>
        <PillButton
          label={t({ id: 'album.address.save', message: 'Save address' })}
          onPress={form.onSave}
          loading={form.pending}
          block
          testID="album-address-save"
        />
      </KeyboardFooter>
      {form.picking ? (
        <CountryPicker onPick={form.pickCountry} onClose={() => setPicking(false)} />
      ) : null}
      {form.removing ? (
        <ConfirmSheet
          title={t({ id: 'album.address.removeTitle', message: 'Remove your address?' })}
          consequences={[
            t({
              id: 'album.address.removeLine',
              message: 'Your crew can no longer mail you printed postcards.',
            }),
          ]}
          confirmLabel={t({ id: 'album.address.removeConfirm', message: 'Remove' })}
          mode="button"
          onConfirm={form.onRemove}
          onCancel={() => setRemoving(false)}
          testID="album-address-remove-confirm"
        />
      ) : null}
    </Scaffold>
  );
}
