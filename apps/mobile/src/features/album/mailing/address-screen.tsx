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
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useOnline } from '@/data/places/server-name-search';
import { CountryPicker, regionName } from '@/features/onboarding';
import { useLocale } from '@/lib/i18n/use-locale';
import { goBackOr } from '@/lib/navigation/back';
import { useCommandFeedback } from '@/motion/island-toast';
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

import { saveMailingAddressCommand } from '../commands';
import {
  addressFields,
  addressProblems,
  EMPTY_ADDRESS,
  type AddressDraft,
  type AddressProblem,
} from './address-form';
import { useAddressPresence } from './use-mailing';

export function AddressScreen() {
  const { t } = useLingui();
  const locale = useLocale();
  const theme = useTheme();
  const online = useOnline();
  const { report } = useCommandFeedback();
  const save = useCommand(saveMailingAddressCommand);
  const [refresh, setRefresh] = useState(0);
  const presence = useAddressPresence(refresh + (online ? 1 : 0));
  const [draft, setDraft] = useState<AddressDraft>(EMPTY_ADDRESS);
  /** Problems show once the traveller has tried to save, then follow the typing. */
  const [checked, setChecked] = useState(false);
  const [picking, setPicking] = useState(false);
  const [removing, setRemoving] = useState(false);
  const problems = checked ? addressProblems(draft) : {};
  const savedCountry = presence?.country
    ? (regionName(presence.country, locale) ?? presence.country)
    : '';
  const set = (key: keyof AddressDraft) => (value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const say = (problem: AddressProblem | undefined) =>
    problem === 'needed'
      ? t({ id: 'album.address.needed', message: 'Needed for the printer' })
      : problem === 'long'
        ? t({ id: 'album.address.long', message: 'Too long for the label' })
        : undefined;

  async function onSave() {
    if (save.pending) return;
    const fields = addressFields(draft);
    if (fields === null) {
      setChecked(true);
      return;
    }
    const outcome = report(await save.send({ fields }), {
      id: 'album-address',
      done: t({ id: 'album.address.savedToast', message: 'Address saved' }),
      needsSignal: t({ id: 'album.address.offline', message: 'Needs signal to save your address' }),
      refused: t({ id: 'album.address.failed', message: "Couldn't save it. Check the fields" }),
    });
    if (outcome === 'done') goBackOr();
  }

  async function onRemove() {
    setRemoving(false);
    if (save.pending) return;
    const outcome = report(await save.send({ fields: null }), {
      id: 'album-address',
      done: t({ id: 'album.address.removed', message: 'Address removed' }),
      needsSignal: t({
        id: 'album.address.removeOffline',
        message: 'Needs signal to remove your address',
      }),
      refused: t({ id: 'album.address.removeFailed', message: "Couldn't remove it. Try again" }),
    });
    if (outcome === 'done') setRefresh((n) => n + 2);
  }

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
            {presence?.saved === true
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
              draft.country === ''
                ? t({ id: 'album.address.countryPick', message: 'Choose the country' })
                : (regionName(draft.country, locale) ?? draft.country)
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
          {presence?.saved === true ? (
            <TextLink
              label={t({ id: 'album.address.remove', message: 'Remove my address' })}
              onPress={() => setRemoving(true)}
              disabled={save.pending}
              testID="album-address-remove"
            />
          ) : null}
        </Stack>
      </KeyboardScrollView>
      <KeyboardFooter>
        <PillButton
          label={t({ id: 'album.address.save', message: 'Save address' })}
          onPress={() => void onSave()}
          loading={save.pending}
          block
          testID="album-address-save"
        />
      </KeyboardFooter>
      {picking ? (
        <CountryPicker
          onPick={(code) => {
            setDraft((d) => ({ ...d, country: code }));
            setPicking(false);
          }}
          onClose={() => setPicking(false)}
        />
      ) : null}
      {removing ? (
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
          onConfirm={() => void onRemove()}
          onCancel={() => setRemoving(false)}
          testID="album-address-remove-confirm"
        />
      ) : null}
    </Scaffold>
  );
}
