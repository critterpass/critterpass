/**
 * The invite composer (undesigned; from the page, field, chip and ticket patterns): it opens on
 * the link anyone in the crew's circle can use and the crew's code, with a named seat for one
 * friend (what the inviter knows about them) as the second tab, for the crew alone or one of its
 * trips; preview the ticket they will
 * see, then send it through WhatsApp, Messages, a copied link, a QR code to scan or the share sheet. A full trip goes
 * to the seat-limit presenter, a signed-out inviter is asked to save their pass first.
 */
import { t } from '@lingui/core/macro';
import { router, useLocalSearchParams } from 'expo-router';
import { useContext, useMemo, useState } from 'react';
import { View } from 'react-native';

import { airportDataset } from '@cp/content/airports';
import { DIAL_CODES } from '@cp/content/onboarding';
import type { InviteSeatLimitDetail } from '@cp/domain';
import { upper } from '@cp/i18n';

import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useSessionUid } from '@/data/powersync/use-session-uid';
import { useLocale } from '@/lib/i18n/use-locale';
import { toast } from '@/motion/island-toast';
import { PillButton } from '@/ui/buttons/PillButton';
import { ChoiceChip } from '@/ui/chips/ChoiceChip';
import { Segmented } from '@/ui/inputs/Segmented';
import { KeyboardFooter } from '@/ui/layout/KeyboardFooter';
import { KeyboardScrollView } from '@/ui/layout/KeyboardScrollView';
import { BackEyebrow } from '@/ui/shell/BackEyebrow';
import { Scaffold } from '@/ui/surface/Scaffold';
import { Text } from '@/ui/text/Text';
import { makeStyles, useTheme } from '@/ui/theme';

import { rowId } from '../crews-sheet/crew-commands';
import { useCrewCode, useCrews } from '../crews-sheet/crew-data';
import { CREW_ROUTES } from '../crews-sheet/routes';
import { useCrewServices } from '../crews-sheet/crew-services';
import { renderSeatLimit } from '../seat-limit/registry';
import { composeUrl, sendInvite, type ComposerChannel } from './compose';
import { ComposerUnavailable } from './composer-unavailable';
import { invitePayload } from './invite-payload';
import { ContactFields, EMPTY_CONTACT, type ContactDraft } from './ContactFields';
import { CrewCode } from './CrewCode';
import { homeHintFor, toE164 } from './home-hint';
import { InvitePreview } from './InvitePreview';
import { JoinQr } from './JoinQr';
import { type InviteComposerProps } from './use-contact-pick';
import { useTagSuggestion } from './use-tag-suggestion';

const useStyles = makeStyles((th) => ({
  scroll: { flex: 1 },
  content: {
    paddingHorizontal: th.space['20'],
    gap: th.space['16'],
    paddingBottom: th.space['32'],
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: th.space['8'] },
  channels: { gap: th.space['8'] },
  qrHint: { textAlign: 'center' },
}));

type Mode = 'friend' | 'link';

export function InviteComposerScreen({ pickContact = null }: InviteComposerProps) {
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
  // The link and the crew code come first: most friends are invited by pasting one in a chat.
  const [mode, setMode] = useState<Mode>('link');
  const code = useCrewCode(localFirst?.db ?? null, crewId === '' ? null : crewId);
  const [contact, setContact] = useState<ContactDraft>(EMPTY_CONTACT);
  const [tripId, setTripId] = useState<string | null>(null);
  const [busy, setBusy] = useState<ComposerChannel | null>(null);
  const [full, setFull] = useState<{
    detail: InviteSeatLimitDetail;
    channel: ComposerChannel;
  } | null>(null);
  const [signIn, setSignIn] = useState(false);
  const [qrUrl, setQrUrl] = useState<string | null>(null);
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

  const payloadFor = (channel: ComposerChannel, onFull?: 'waitlist') =>
    invitePayload({ crewId, tripId, contact: mode === 'friend' ? contact : null }, channel, onFull);

  const deliver = async (channel: ComposerChannel, url: string) => {
    const message = t({
      id: 'crew.composer.message',
      message: `Come to ${crewName} on CritterPass: ${url}`,
    });
    if (channel === 'qr') {
      setQrUrl(url);
      return;
    }
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
            ? t({
                id: 'crew.composer.needsSignal',
                message: 'You’re offline. Send the invite when you’re back online.',
              })
            : t({ id: 'crew.composer.failed', message: 'That invite didn’t go out. Try again.' }),
      });
  };

  const invitee = mode === 'friend' ? contact.name.trim() : '';
  const backLabel = t({ id: 'crew.composer.back', message: 'Back' });
  if (localFirst === null || !snapshot.loaded || crew === null) {
    return <ComposerUnavailable loaded={localFirst !== null && snapshot.loaded} />;
  }
  const sendButton = (channel: ComposerChannel, label: string) => (
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
  );
  return (
    // The footer pads the bottom inset and rides the keyboard: the friend's fields scroll clear of
    // it and the main send stays in reach while they are typed.
    <Scaffold variant="dark" edges={['top']} testID="invite-composer">
      <KeyboardScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        <BackEyebrow label={backLabel} fallback={CREW_ROUTES.home} />
        <Text variant="displayXl" accessibilityRole="header">
          {upper(t({ id: 'crew.composer.title', message: `Invite to ${crewName}` }), locale)}
        </Text>
        <Segmented
          label={t({ id: 'crew.composer.mode', message: 'Who' })}
          segments={[
            {
              value: 'link' as const,
              label: t({ id: 'crew.composer.link', message: 'A link to share' }),
            },
            {
              value: 'friend' as const,
              label: t({ id: 'crew.composer.friend', message: 'A friend' }),
            },
          ]}
          value={mode}
          onChange={setMode}
          testID="composer-mode"
        />
        {mode === 'link' && code !== null ? (
          <CrewCode
            code={code}
            onCopy={() => {
              void services.copy(code);
              toast.show({
                id: rowId('code-copied', code),
                title: t({ id: 'crew.composer.codeCopied', message: 'Code copied' }),
              });
            }}
          />
        ) : null}
        {mode === 'friend' ? (
          <ContactFields
            value={contact}
            homeHint={homeHint}
            suggestion={suggestion}
            pickContact={pickContact}
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
        <InvitePreview
          locale={locale}
          crewName={crewName}
          invitee={invitee}
          place={trip?.place ?? null}
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
          {sendButton('imsg', t({ id: 'crew.composer.messages', message: 'Messages' }))}
          {sendButton('copy', t({ id: 'crew.composer.copy', message: 'Copy link' }))}
          {sendButton('qr', t({ id: 'crew.composer.qr', message: 'Show a QR code' }))}
          {sendButton('share', t({ id: 'crew.composer.share', message: 'More…' }))}
        </View>
        {qrUrl === null ? null : (
          <View style={styles.channels} testID="composer-qr">
            <JoinQr url={qrUrl} />
            <Text variant="body" style={styles.qrHint}>
              {t({ id: 'crew.composer.qrHint', message: 'Hold it up for them to scan.' })}
            </Text>
          </View>
        )}
        {signIn ? (
          <PillButton
            label={t({ id: 'crew.composer.save', message: 'Save my pass' })}
            onPress={() => router.push(CREW_ROUTES.savePass)}
            testID="composer-save"
          />
        ) : null}
      </KeyboardScrollView>
      <KeyboardFooter>
        {sendButton('wa', t({ id: 'crew.composer.whatsapp', message: 'WhatsApp' }))}
      </KeyboardFooter>
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
