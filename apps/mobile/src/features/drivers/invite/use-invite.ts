/**
 * The invite's state, shared by both looks: asks the server for his one-time link (online only),
 * prefills the message in English (Bahasa below when asked) and opens WhatsApp with it. The member
 * presses send; we never send for them. `driver` is null until the crew's drivers have loaded.
 */
/* eslint-disable lingui/no-unlocalized-strings -- wire values, SQL and format options, never copy. */
import { format } from '@cp/i18n';
import {
  driverInviteMessage,
  whatsAppLink,
  type DriverInviteMessageInput,
  type InviteDriverResult,
} from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { useEffect, useRef, useState } from 'react';
import { Linking } from 'react-native';

import { shortName } from '@/lib/people/member-name';
import { useCommand } from '@/data/commands/use-command';
import { useLocalFirst } from '@/data/powersync/local-first-context';
import { OWNER_UID_KEY } from '@/data/powersync/local-tables';
import { useLocale } from '@/lib/i18n/use-locale';

import { inviteDriverCommand } from '../ours/commands';
import { useOurDrivers } from '../ours/use-our-drivers';

const NAME_SQL = `SELECT display_name FROM users
  WHERE id = (SELECT value FROM local_state WHERE id = ?)`;

export function useInvite(tripId: string, providerId: string) {
  const { t } = useLingui();
  const locale = useLocale();
  const { data } = useOurDrivers(tripId);
  const { db } = useLocalFirst();
  const [myName, setMyName] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void db
      .getAll<{ display_name: string | null }>(NAME_SQL, [OWNER_UID_KEY])
      .then((rows) => {
        if (live) setMyName(rows[0]?.display_name ?? null);
      })
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, [db]);
  const invite = useCommand(inviteDriverCommand);
  const [link, setLink] = useState<InviteDriverResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [withBahasa, setWithBahasa] = useState(false);
  const [edited, setEdited] = useState<string | null>(null);
  const asked = useRef(false);

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    void invite.send({ trip_id: tripId, provider_id: providerId }).then((result) => {
      if (result.kind === 'applied') {
        setLink(result.result as InviteDriverResult);
        return;
      }
      setError(
        result.kind === 'unavailable'
          ? t({ id: 'drivers.invite.offline', message: 'Needs signal to make his link.' })
          : result.kind === 'rejected' && result.code === 'STATE_INVALID'
            ? t({
                id: 'drivers.invite.noPhone',
                message: 'Add his WhatsApp number to the trip first, or he is already listed.',
              })
            : t({ id: 'drivers.invite.failed', message: "Couldn't make his link. Try again." }),
      );
    });
  }, [invite, providerId, t, tripId]);

  const driver = data?.drivers.find((row) => row.provider_id === providerId);
  const first = driver === undefined ? '' : shortName(driver.name);
  const input: DriverInviteMessageInput | null =
    link === null || driver === undefined
      ? null
      : {
          driverName: first,
          // The message is English for the driver, whatever the app's language.
          senderName: (myName ?? '').trim() === '' ? 'one of your passengers' : shortName(myName),
          crewSize: data?.crew_size ?? 1,
          places: '',
          dates: '',
          url: link.url.replace(/^https:\/\//, ''),
        };
  const message = edited ?? (input === null ? null : driverInviteMessage(input, withBahasa));
  const expiresOn =
    link === null
      ? null
      : format.date(locale, new Date(link.expires_at), { day: 'numeric', month: 'short' });

  return {
    driver: driver ?? null,
    name: first,
    message,
    withBahasa,
    expiresOn,
    error,
    setMessage: setEdited,
    setBahasa: (on: boolean) => {
      setWithBahasa(on);
      setEdited(null);
    },
    openWhatsApp: () => {
      if (link !== null && message !== null) {
        void Linking.openURL(whatsAppLink(link.phone_e164, message));
      }
    },
  };
}
