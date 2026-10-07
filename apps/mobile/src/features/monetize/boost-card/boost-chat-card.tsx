/**
 * The crew chat's `boost_card` message: the card over the synced boost it points at. It holds the
 * trip's streams while it is on screen (the chat itself rides the crew's), so the split's shares
 * and the crew's payments arrive and the SETTLED row fills in as people pay. SETTLE opens settling
 * up; THANKS tells the buyer once, and the card flips when the server's row says so.
 */
/* eslint-disable lingui/no-unlocalized-strings -- a command name and Intl option values, never copy. */
import { format } from '@cp/i18n';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';

import { defineClientCommand } from '@/data/commands/summaries';
import { useCommand } from '@/data/commands/use-command';
import { useLiveRows } from '@/data/plan/live-rows';
import { useTripStreams } from '@/data/powersync/use-trip-streams';
import type { ChatCardProps } from '@/features/crew';
import { useLocale } from '@/lib/i18n/use-locale';
import { memberFirstName } from '@/ui/people/member-name';

import { PERKS_SQL, PERKS_TABLES, perkFromRow, type PerkRow } from '../data/billing-rows';
import { useOwnerUid } from '../data/use-billing';
import { boostCardModel, shareText } from './boost-card-model';
import {
  CARD_BOOST_SQL,
  CARD_BOOST_TABLES,
  CARD_PAYMENTS_SQL,
  CARD_PAYMENTS_TABLES,
  CARD_SHARES_SQL,
  CARD_SHARES_TABLES,
  uuidList,
  type CardBoostRow,
  type CardPaymentRow,
  type CardShareRow,
} from './boost-card-rows';
import { BoostCardView } from './boost-card-view';
import { boostChips, REDRAFTS_PERK } from './perk-chips';

export const thankBoostCommand = defineClientCommand<{ readonly boost_id: string }>({
  name: 'thank_boost',
  offline: true,
});

const SETTLE_ROUTE = '/money/settle';
const DAY_MONTH: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', timeZone: 'UTC' };
const NO_PARAMS: readonly unknown[] = [];

function utcDay(iso: string | null): Date | null {
  if (iso === null) return null;
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function tripDates(locale: string, start: string | null, end: string | null): string {
  const from = utcDay(start);
  const to = utcDay(end);
  if (from === null) return '';
  return to === null
    ? format.date(locale, from, DAY_MONTH)
    : format.dateInterval(locale, from, to, DAY_MONTH);
}

export function BoostChatCard({ message }: ChatCardProps) {
  const { t, i18n } = useLingui();
  const locale = useLocale();
  const uid = useOwnerUid();
  const boostId = message.refId;
  const key = useMemo(() => (boostId === null ? null : [boostId]), [boostId]);
  const row = useLiveRows<CardBoostRow>(CARD_BOOST_SQL, key, CARD_BOOST_TABLES).rows[0];
  useTripStreams(row?.trip_id ?? null);
  const shares = useLiveRows<CardShareRow>(CARD_SHARES_SQL, key, CARD_SHARES_TABLES).rows;
  const paymentsKey = useMemo(
    () => (row === undefined || row.buyer_id === null ? null : [row.trip_id, row.buyer_id]),
    [row],
  );
  const payments = useLiveRows<CardPaymentRow>(
    CARD_PAYMENTS_SQL,
    paymentsKey,
    CARD_PAYMENTS_TABLES,
  ).rows;
  const perkRows = useLiveRows<PerkRow>(PERKS_SQL, NO_PARAMS, PERKS_TABLES).rows;
  const { send } = useCommand(thankBoostCommand);
  const [thanking, setThanking] = useState(false);

  const model = boostCardModel({
    viewerUid: uid,
    boost:
      row === undefined
        ? null
        : {
            id: row.id,
            buyerId: row.buyer_id,
            status: row.status,
            split: row.split_mode === 'split',
            splitMemberIds: uuidList(row.split_member_ids),
            thankedBy: uuidList(row.thanked_by),
            createdAt: row.created_at,
          },
    shares: shares.map((share) => ({
      userId: share.user_id,
      name: memberFirstName(share.display_name),
      minor: Number(share.computed_minor ?? 0),
      currency: share.currency,
    })),
    payments: payments.map((payment) => ({
      fromId: payment.from_id,
      toId: payment.to_id,
      status: payment.status,
      createdAt: payment.created_at,
    })),
  });

  const perks = perkRows.flatMap((perkRow) => {
    const perk = perkFromRow(perkRow);
    return perk === null ? [] : [perk];
  });
  const chips = boostChips(perks);
  const redrafts = chips.some((chip) => chip.key === REDRAFTS_PERK);
  const guide =
    row === undefined || row.guide_slug === null || !redrafts || model.kind !== 'live'
      ? null
      : {
          id: row.guide_slug,
          name: row.guide_name ?? '',
          line: t({
            id: 'monetize.card.guideLine',
            message: 'No more counting. Who wants a day back?',
          }),
        };

  return (
    <BoostCardView
      model={model}
      buyer={row === undefined || row.buyer_id === null ? '' : memberFirstName(row.buyer_name)}
      destination={row?.destination ?? row?.crew ?? ''}
      dates={tripDates(locale, row?.start_date ?? null, row?.end_date ?? null)}
      perks={chips.map((chip) => i18n._(chip.copy))}
      share={model.kind === 'live' && model.share !== null ? shareText(model.share, locale) : null}
      guide={guide}
      thanking={thanking}
      onSettle={() => router.push(SETTLE_ROUTE)}
      onThanks={() => {
        if (boostId === null || thanking) return;
        setThanking(true);
        // The card flips to "Sent" when the boost row says so; a refusal leaves the button.
        void send({ boost_id: boostId })
          .catch(() => undefined)
          .finally(() => setThanking(false));
      }}
    />
  );
}
