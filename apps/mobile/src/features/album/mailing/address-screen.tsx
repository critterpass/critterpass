/* eslint-disable lingui/no-unlocalized-strings -- field keys and input settings, never copy. */
/**
 * The traveller's own postal address for printed postcards (undesigned; a form from the app's
 * fields), opened from the "add an address" request a crewmate's mailing sends. Saving it is the
 * consent to receive printed postcards from the crew; the address is sealed on the server and
 * never shown to the crew, the guide or a model. Removing it withdraws the consent.
 */
import { mailingAddressFieldsSchema, type MailingAddressFields } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { feedback, toast } from '@/motion';
import { PillButton } from '@/ui/buttons/PillButton';
import { TextLink } from '@/ui/buttons/TextLink';
import { SecondaryText } from '@/ui/cards/SecondaryText';
import { TextField } from '@/ui/inputs/TextField';
import { KeyboardFooter } from '@/ui/layout/KeyboardFooter';
import { KeyboardScrollView } from '@/ui/layout/KeyboardScrollView';
import { Stack } from '@/ui/layout/Stack';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { LargeTitle } from '@/ui/shell/LargeTitle';
import { Scaffold } from '@/ui/surface/Scaffold';

import { saveMailingAddressCommand } from '../commands';
import { useAddressPresence } from './use-mailing';

type Draft = Record<keyof MailingAddressFields, string>;
const EMPTY: Draft = {
  name: '',
  line1: '',
  line2: '',
  city: '',
  region: '',
  postal_code: '',
  country: '',
};

/** The form's fields as the command takes them; optional lines left out when blank. */
export function addressFields(draft: Draft): MailingAddressFields | null {
  const parsed = mailingAddressFieldsSchema.safeParse({
    name: draft.name,
    line1: draft.line1,
    city: draft.city,
    country: draft.country.trim().toUpperCase(),
    ...(draft.line2.trim() ? { line2: draft.line2 } : {}),
    ...(draft.region.trim() ? { region: draft.region } : {}),
    ...(draft.postal_code.trim() ? { postal_code: draft.postal_code } : {}),
  });
  return parsed.success ? parsed.data : null;
}

export function AddressScreen() {
  const { t } = useLingui();
  const save = useCommand(saveMailingAddressCommand);
  const [refresh, setRefresh] = useState(0);
  const presence = useAddressPresence(refresh);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const fields = addressFields(draft);
  const country = presence?.country ?? '';
  const set = (key: keyof Draft) => (value: string) => setDraft((d) => ({ ...d, [key]: value }));

  async function submit(next: MailingAddressFields | null) {
    const result = await save.send({ fields: next });
    if (result.kind === 'applied') {
      feedback.emit('success');
      setDraft(EMPTY);
      setRefresh((n) => n + 1);
      return;
    }
    feedback.emit('error');
    toast.show({
      id: 'album-address-failed',
      title:
        result.kind === 'unavailable'
          ? t({ id: 'album.address.offline', message: 'Needs signal to save your address' })
          : t({ id: 'album.address.failed', message: "Couldn't save it. Check the fields" }),
    });
  }

  const field = (key: keyof Draft, label: string, extra: object = {}) => (
    <TextField
      label={label}
      value={draft[key]}
      onChangeText={set(key)}
      testID={`album-address-${key}`}
      {...extra}
    />
  );

  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="album-address">
      <LargeTitle
        title={t({ id: 'album.address.title', message: 'Your address' })}
        start={
          <BackEyebrow
            label={t({ id: 'album.address.back', message: 'Back' })}
            onPress={() => router.back()}
          />
        }
      />
      <KeyboardScrollView>
        <Stack gap="12" padding="16">
          <SecondaryText variant="body">
            {presence?.saved === true
              ? t({
                  id: 'album.address.saved',
                  message: `Saved (${country}). Your crew can mail you a printed postcard. They never see the address. Fill the form again to change it.`,
                })
              : t({
                  id: 'album.address.why',
                  message:
                    'For printed postcards from your crew. Only the printer sees it; your crew and the guide never do.',
                })}
          </SecondaryText>
          {field('name', t({ id: 'album.address.name', message: 'Name on the card' }))}
          {field('line1', t({ id: 'album.address.line1', message: 'Street and number' }))}
          {field('line2', t({ id: 'album.address.line2', message: 'Flat, floor (optional)' }))}
          {field('city', t({ id: 'album.address.city', message: 'City' }))}
          {field(
            'region',
            t({ id: 'album.address.region', message: 'State or province (optional)' }),
          )}
          {field('postal_code', t({ id: 'album.address.postal', message: 'Postcode' }))}
          {field(
            'country',
            t({ id: 'album.address.country', message: 'Country code (like VN or GB)' }),
            {
              autoCapitalize: 'characters',
              maxLength: 2,
            },
          )}
          {presence?.saved === true ? (
            <TextLink
              label={t({ id: 'album.address.remove', message: 'Remove my address' })}
              onPress={() => void submit(null)}
              testID="album-address-remove"
            />
          ) : null}
        </Stack>
      </KeyboardScrollView>
      <KeyboardFooter>
        <PillButton
          label={t({ id: 'album.address.save', message: 'Save address' })}
          onPress={() => void submit(fields)}
          disabled={fields === null}
          loading={save.pending}
          block
          testID="album-address-save"
        />
      </KeyboardFooter>
    </Scaffold>
  );
}
