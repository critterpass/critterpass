/**
 * The invite composer (undesigned; from the page, field, chip and ticket patterns): invite a
 * friend by name (a named seat, with what the inviter knows about them) or share a link anyone in
 * the crew's circle can use, for the crew alone or one of its trips; preview the ticket they will
 * see, then send it through WhatsApp, Messages, a copied link or the share sheet. A full trip goes
 * to the seat-limit presenter, a signed-out inviter is asked to save their pass first.
 */
import { t } from '@lingui/core/macro';
import { router, useLocalSearchParams } from 'expo-router';
import { useContext, useMemo, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { airportDataset } from '@cp/content/airports';
import { DIAL_CODES } from '@cp/content/onboarding';
import type { CreateInvitePayload, InviteSeatLimitDetail } from '@cp/domain';
import { upper } from '@cp/i18n';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useLocale } from '@/lib/i18n/use-locale';
import { toast } from '@/motion/island-toast';
import { PillButton } from '@/ui/buttons/PillButton';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { Ticket } from '@/ui/documents/Ticket';
import { Segmented } from '@/ui/inputs/Segmented';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { rowId } from '../crews-sheet/crew-commands';
import { useCrews } from '../crews-sheet/crew-data';
import { CREW_ROUTES } from '../crews-sheet/routes';
import { useCrewServices } from '../crews-sheet/crew-services';
import { useSessionUid } from '../crews-sheet/CrewsSheet';
import { renderSeatLimit } from '../seat-limit/registry';
import { composeUrl, sendInvite, shareVia, type ComposerChannel } from './compose';
import { ContactFields, EMPTY_CONTACT, type ContactDraft } from './ContactFields';
import { homeHintFor, toE164 } from './home-hint';
import { useTagSuggestion } from './use-tag-suggestion';

const useStyles = makeStyles((th) => ({
  content: {
    paddingHorizontal: th.space['20'],
    gap: th.space['16'],
    paddingBottom: th.space['32'],
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: th.space['8'] },
  channels: { gap: th.space['8'] },
}));

type Mode = 'friend' | 'link';

export function InviteComposerScreen() {
  const styles = useStyles();
  const theme = useTheme();
  const locale = useLocale();
  const services = useCrewServices();
  const localFirst = useContext(LocalFirstContext);
  const uid = useSessionUid();
  const { crewId = '' } = useLocalSearchParams<{ crewId?: string }>();
  const snapshot = useCrews(localFirst?.db ?? null, uid);
  const crew = snapshot.crews.find((c) => c.id === crewId) ?? null;
  const trips = snapshot.trips.filter((trip) => trip.crew_id === crewId);
  const [mode, setMode] = useState<Mode>('friend');
  const [contact, setContact] = useState<ContactDraft>(EMPTY_CONTACT);
  const [tripId, setTripId] = useState<string | null>(null);
  const [busy, setBusy] = useState<ComposerChannel | null>(null);
  const [full, setFull] = useState<{
    detail: InviteSeatLimitDetail;
    channel: ComposerChannel;
  } | null>(null);
  const [signIn, setSignIn] = useState(false);
  const phone = toE164(contact.phone);
  const homeHint = useMemo(
    () => (phone === null ? null : homeHintFor(phone, DIAL_CODES, airportDataset().airports)),
    [phone],
  );
  const crewName = crew?.name ?? '';
  const trip = trips.find((x) => x.id === tripId) ?? null;
  const suggestion = useTagSuggestion({
    enabled: mode === 'friend' && localFirst !== null,
    crewId,
    tripId,
    name: contact.name,
    note: contact.note,
  });
  const friendReady =
    contact.name.trim().length > 0 && (contact.phone.trim() === '' || phone !== null);
  const ready = localFirst !== null && crew !== null && (mode === 'link' || friendReady);

  const payloadFor = (channel: ComposerChannel, onFull?: 'waitlist'): CreateInvitePayload => {
    const via = shareVia(channel);
    const base = {
      crew_id: crewId,
      ...(tripId === null ? {} : { trip_id: tripId }),
      ...(via === undefined ? {} : { share_via: via }),
      ...(onFull === undefined ? {} : { on_full: onFull }),
    };
    if (mode === 'link') return { ...base, channel: 'link' };
    return {
      ...base,
      channel: 'contact',
      contact: {
        name: contact.name.trim(),
        provenance: 'typed',
        ...(phone === null ? {} : { phone_e164: phone }),
        ...(homeHint === null ? {} : { home_hint: homeHint }),
      },
      ...(contact.note.trim() === '' ? {} : { note: contact.note.trim() }),
      ...(contact.tags.length === 0 ? {} : { tags: [...contact.tags] }),
    };
  };

  const deliver = async (channel: ComposerChannel, url: string) => {
    const message = t({
      id: 'crew.composer.message',
      message: `Come to ${crewName} on CritterPass: ${url}`,
    });
    if (channel === 'copy') {
      await services.copy(url);
      toast.show({
        id: rowId('invite-copied', url),
        title: t({ id: 'crew.composer.copied', message: 'Link copied' }),
      });
      return;
    }
    const compose = composeUrl(channel, message);
    if (compose === null || !(await services.openUrl(compose))) await services.share(message);
  };

  const send = async (channel: ComposerChannel, onFull?: 'waitlist') => {
    if (localFirst === null) return;
    setBusy(channel);
    const outcome = await sendInvite(localFirst.commands, payloadFor(channel, onFull));
    setBusy(null);
    if (outcome.kind === 'sent') {
      await deliver(channel, outcome.result.url);
      if (mode === 'friend') setContact(EMPTY_CONTACT);
    } else if (outcome.kind === 'full') setFull({ detail: outcome.detail, channel });
    else if (outcome.kind === 'sign_in') setSignIn(true);
    else
      toast.show({
        id: rowId('invite-failed', crewId),
        title:
          outcome.kind === 'offline'
            ? t({ id: 'crew.composer.offline', message: 'Invites go out once you’re online' })
            : t({ id: 'crew.composer.failed', message: 'That invite didn’t go out. Try again.' }),
      });
  };

  const invitee = mode === 'friend' ? contact.name.trim() : '';
  return (
    <Scaffold variant="dark" edges={['top', 'bottom']} testID="invite-composer">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <BackEyebrow label={crewName} />
        <Text variant="displayXl" accessibilityRole="header">
          {upper(t({ id: 'crew.composer.title', message: `Invite to ${crewName}` }), locale)}
        </Text>
        <Segmented
          label={t({ id: 'crew.composer.mode', message: 'Who' })}
          segments={[
            {
              value: 'friend' as const,
              label: t({ id: 'crew.composer.friend', message: 'A friend' }),
            },
            {
              value: 'link' as const,
              label: t({ id: 'crew.composer.link', message: 'A link to share' }),
            },
          ]}
          value={mode}
          onChange={setMode}
          testID="composer-mode"
        />
        {mode === 'friend' ? (
          <ContactFields
            value={contact}
            homeHint={homeHint}
            suggestion={suggestion}
            onChange={setContact}
          />
        ) : null}
        {trips.length > 0 ? (
          <View style={styles.chips}>
            <ChoiceChip
              label={t({ id: 'crew.composer.crewOnly', message: 'Just the crew' })}
              selected={tripId === null}
              onPress={() => setTripId(null)}
              testID="composer-trip-none"
            />
            {trips.map((x) => (
              <ChoiceChip
                key={x.id}
                label={x.place ?? t({ id: 'crew.composer.aTrip', message: 'The trip' })}
                selected={tripId === x.id}
                onPress={() => setTripId(x.id)}
                testID={rowId('composer-trip', x.id)}
              />
            ))}
          </View>
        ) : null}
        <Ticket
          kind="crew"
          headStart={upper(t({ id: 'crew.composer.previewHead', message: 'They’ll see' }), locale)}
          headEnd={upper(crewName, locale)}
          from={{
            code: upper(
              invitee === '' ? t({ id: 'crew.composer.you', message: 'You' }) : invitee.slice(0, 8),
              locale,
            ),
          }}
          to={{ code: upper((trip?.place ?? crewName).replace(/\s+/gu, '').slice(0, 3), locale) }}
          fields={[
            {
              key: 'crew',
              label: t({ id: 'crew.composer.previewCrew', message: 'Crew' }),
              value: crewName,
            },
          ]}
          stubText={
            invitee === ''
              ? t({ id: 'crew.composer.previewGeneric', message: 'A seat in the crew' })
              : t({ id: 'crew.composer.previewNamed', message: `A seat for ${invitee}` })
          }
          accessibilityLabel={t({
            id: 'crew.composer.previewA11y',
            message: 'Preview of the invite ticket',
          })}
          testID="composer-preview"
        />
        {signIn ? (
          <Text variant="body" color={theme.semantic.state.urgent} testID="composer-sign-in">
            {t({
              id: 'crew.composer.signIn',
              message: 'Save your pass first: invites go out from a saved account.',
            })}
          </Text>
        ) : null}
        <View style={styles.channels}>
          {(
            [
              ['wa', t({ id: 'crew.composer.whatsapp', message: 'WhatsApp' })],
              ['imsg', t({ id: 'crew.composer.messages', message: 'Messages' })],
              ['copy', t({ id: 'crew.composer.copy', message: 'Copy link' })],
              ['share', t({ id: 'crew.composer.share', message: 'More…' })],
            ] as const
          ).map(([channel, label]) => (
            <PillButton
              key={channel}
              label={label}
              variant={channel === 'wa' ? 'primary' : 'secondary'}
              onPress={() => void send(channel)}
              loading={busy === channel}
              disabled={!ready || busy !== null}
              block
              testID={rowId('composer-send', channel)}
            />
          ))}
        </View>
        {signIn ? (
          <PillButton
            label={t({ id: 'crew.composer.save', message: 'Save my pass' })}
            onPress={() => router.push(CREW_ROUTES.savePass)}
            testID="composer-save"
          />
        ) : null}
      </ScrollView>
      {full !== null
        ? renderSeatLimit({
            detail: full.detail,
            tripName: trip?.place ?? crewName,
            onWaitlist: () => {
              const channel = full.channel;
              setFull(null);
              void send(channel, 'waitlist');
            },
            onDismiss: () => setFull(null),
          })
        : null}
    </Scaffold>
  );
}
