/**
 * The mailbox connection's state for the connect sheet and the Settings row (3n-2): whether any
 * provider is switched on (each waits for its verification, Google CASA and Microsoft publisher
 * verification), whether the member has Pass+, and their connection as the api reports it.
 */
/* eslint-disable lingui/no-unlocalized-strings -- flag keys and wire values, never copy. */
import type { MailboxConnectionWire, MailboxProvider } from '@cp/domain';
import { useCallback, useEffect, useState } from 'react';

import { useFlag } from '@/lib/analytics/flags';

import { useBookingsServices } from '../data/services';
import { loadConnections } from './oauth';

export type MailboxStatus =
  | { readonly kind: 'soon' }
  | { readonly kind: 'locked' }
  | { readonly kind: 'connected'; readonly connection: MailboxConnectionWire }
  | { readonly kind: 'choose'; readonly providers: readonly MailboxProvider[] };

export function mailboxStatus(input: {
  readonly gmail: boolean;
  readonly microsoft: boolean;
  readonly passPlus: boolean;
  readonly connections: readonly MailboxConnectionWire[] | null;
}): MailboxStatus {
  const connection = input.connections?.find((item) => item.status !== 'revoked');
  if (connection !== undefined) return { kind: 'connected', connection };
  const providers: MailboxProvider[] = [];
  if (input.gmail) providers.push('gmail');
  if (input.microsoft) providers.push('microsoft');
  if (providers.length === 0) return { kind: 'soon' };
  if (!input.passPlus) return { kind: 'locked' };
  return { kind: 'choose', providers };
}

export function useMailbox(passPlus: boolean): { status: MailboxStatus; reload: () => void } {
  const services = useBookingsServices();
  const gmail = useFlag('mailbox.gmail');
  const microsoft = useFlag('mailbox.microsoft');
  const [connections, setConnections] = useState<MailboxConnectionWire[] | null>(null);
  const [tick, setTick] = useState(0);
  const on = gmail === true || microsoft === true;
  useEffect(() => {
    if (!on) return undefined;
    let live = true;
    loadConnections(services).then(
      (list) => {
        if (live && list !== null) setConnections(list);
      },
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [services, on, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return {
    status: mailboxStatus({
      gmail: gmail === true,
      microsoft: microsoft === true,
      passPlus,
      connections,
    }),
    reload,
  };
}
