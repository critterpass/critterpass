/**
 * The sent page over the phone: the ticket number once the server's row has synced, the queued
 * variant while the phone is offline, and the traveller's own name.
 */
/* eslint-disable lingui/no-unlocalized-strings -- SQL, never copy. */
import { isFeedbackCategory, isFeedbackMood } from '@cp/domain';
import { format } from '@cp/i18n';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';

import { goBackOr } from '@/lib/navigation/back';
import { useLocalFirst } from '@/data/powersync/local-first-context';
import { useLocale } from '@/lib/i18n/use-locale';

import { useLiveRows } from '../data/live-rows';
import { HELP_ROUTES } from '../routes';
import { useFeedbackLabels } from './labels';
import { SentView } from './SentView';

const TICKET_SQL = 'SELECT ticket_no, sent_at FROM feedback_tickets WHERE id = ?';
const NAME_SQL = `SELECT u.display_name AS name FROM users u
  JOIN local_state s ON s.id = 'owner_uid' AND s.value = u.id`;

export function SentScreen() {
  const params = useLocalSearchParams<{
    ticket: string;
    note?: string;
    mood?: string;
    topic?: string;
  }>();
  const locale = useLocale();
  const { network } = useLocalFirst();
  const [online, setOnline] = useState(network.isOnline());
  useEffect(() => network.subscribe(setOnline), [network]);
  const { moods, topics } = useFeedbackLabels();
  const ticket = useLiveRows<{ ticket_no: number | null; sent_at: string | null }>(
    TICKET_SQL,
    [params.ticket ?? ''],
    ['feedback_tickets'],
  );
  const me = useLiveRows<{ name: string | null }>(NAME_SQL, [], ['users', 'local_state']);
  const ticketNo = ticket.rows[0]?.ticket_no ?? null;
  // The stamp carries the day the ticket was sent; until it syncs, today (it was sent just now).
  const sentAt = ticket.rows[0]?.sent_at;
  const sentOn = sentAt ? new Date(sentAt) : new Date();
  const heading = [
    isFeedbackCategory(params.topic) ? topics[params.topic] : null,
    isFeedbackMood(params.mood) ? moods[params.mood] : null,
  ]
    .filter((part): part is string => part !== null)
    .join(' · ');
  return (
    <SentView
      ticketNo={ticketNo}
      queued={!online}
      heading={heading}
      note={typeof params.note === 'string' ? params.note : ''}
      name={me.rows[0]?.name?.split(' ')[0] ?? null}
      receivedOn={format.date(locale, sentOn, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })}
      onDone={() => goBackOr(HELP_ROUTES.hub)}
    />
  );
}
