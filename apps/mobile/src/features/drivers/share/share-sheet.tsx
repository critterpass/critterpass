/**
 * Share with your driver, wired: the trip's days, the crew's live link for this driver (one per
 * driver; a new one replaces the old), the commands, the clipboard and WhatsApp (the person sends
 * the message themselves). The open count follows the plan channel.
 */
/* eslint-disable lingui/no-unlocalized-strings -- status values, never copy. */
import { useLingui } from '@lingui/react/macro';
import * as Clipboard from 'expo-clipboard';
import * as Linking from 'expo-linking';
import { useContext, useMemo, useState } from 'react';

import { DRIVER_PLAN_DEFAULT_EXPIRY_DAYS, type DriverPlanShare } from '@cp/domain';

import { useTripPlan } from '@/data/plan/use-trip-plan';
import { LocalFirstContext } from '@/data/powersync/local-first-context';
import { useLocale } from '@/lib/i18n/use-locale';

import {
  CREATE_DRIVER_PLAN_SHARE,
  REVOKE_DRIVER_PLAN_SHARE,
  UPDATE_DRIVER_PLAN_SHARE,
  liveShareFor,
  useDriverShares,
  whatsAppUrl,
} from './data';
import { DriverShareSheetView, type DriverShareStatus } from './share-sheet-view';
import { dayLabel, expiryChoices, nextExpiry, openedLine } from './share-text';

export function DriverShareSheet({
  tripId,
  initialName = '',
  onClose,
}: {
  readonly tripId: string;
  readonly initialName?: string;
  readonly onClose: () => void;
}) {
  const { t } = useLingui();
  const locale = useLocale();
  const plan = useTripPlan(tripId);
  const commands = useContext(LocalFirstContext)?.commands ?? null;
  const { read, last, refresh } = useDriverShares(tripId);
  const [name, setName] = useState(initialName);
  const [created, setCreated] = useState<DriverPlanShare | null>(null);
  const [status, setStatus] = useState<DriverShareStatus>('idle');
  const live = created ?? (last === null ? null : liveShareFor(last.shares, name.trim()));
  const [picked, setPicked] = useState<ReadonlySet<number> | null>(null);
  const [expiryDays, setExpiryDays] = useState(DRIVER_PLAN_DEFAULT_EXPIRY_DAYS);
  const [quoteChoice, setQuoteChoice] = useState<boolean | null>(null);
  const allowQuote = quoteChoice ?? live?.allow_quote ?? true;
  // What the person picked here wins; else the live link's days; else every day of the plan.
  const selected = useMemo(
    () => picked ?? new Set(live?.day_nos ?? plan.dayRows.map((d) => d.day_no)),
    [picked, live?.day_nos, plan.dayRows],
  );
  const days = useMemo(
    () =>
      plan.dayRows.map((d) => ({
        dayNo: d.day_no,
        label: dayLabel(locale, d.date, d.day_no),
        selected: selected.has(d.day_no),
      })),
    [plan.dayRows, locale, selected],
  );
  const shareText = (url: string) =>
    t({
      id: 'drivers.share.message',
      message: `Here are the days we need you, with times and pickups: ${url}`,
    });

  const update = async (payload: {
    day_nos?: number[];
    expires_in_days?: number;
    allow_quote?: boolean;
  }) => {
    if (live === null) return;
    const sent = await commands?.send(UPDATE_DRIVER_PLAN_SHARE, { share_id: live.id, ...payload });
    if (sent?.kind !== 'applied') setStatus('needs_signal');
    else setCreated(sent.result as DriverPlanShare);
  };

  return (
    <DriverShareSheetView
      driverName={name}
      onDriverName={live === null ? setName : null}
      url={live?.url ?? null}
      days={days}
      onToggleDay={(dayNo) => {
        const next = new Set(selected);
        if (next.has(dayNo)) next.delete(dayNo);
        else next.add(dayNo);
        setPicked(next);
        if (live !== null && next.size > 0) void update({ day_nos: [...next] });
      }}
      expiresLabel={expiryChoices(locale, live?.expires_at ?? null, expiryDays)}
      onCycleExpiry={() => {
        const next = nextExpiry(expiryDays);
        setExpiryDays(next);
        if (live !== null) void update({ expires_in_days: next });
      }}
      allowQuote={allowQuote}
      onAllowQuote={(next) => {
        setQuoteChoice(next);
        if (live !== null) void update({ allow_quote: next });
      }}
      opened={live === null ? null : openedLine(locale, live.open_count, live.last_opened_at)}
      stale={read.kind === 'offline'}
      status={status}
      onCreate={() => {
        setStatus('creating');
        void (async () => {
          const sent = await commands?.send(CREATE_DRIVER_PLAN_SHARE, {
            trip_id: tripId,
            driver_name: name.trim(),
            day_nos: [...selected].sort((a, b) => a - b),
            expires_in_days: expiryDays,
            allow_quote: allowQuote,
          });
          if (sent?.kind !== 'applied') {
            setStatus('needs_signal');
            return;
          }
          setCreated(sent.result as DriverPlanShare);
          setStatus('idle');
          refresh();
        })();
      }}
      onCopy={() => {
        if (live === null || live.url === null) return;
        void Clipboard.setStringAsync(live.url).then(() => setStatus('copied'));
      }}
      onWhatsApp={() => {
        if (live === null || live.url === null) return;
        void Linking.openURL(whatsAppUrl(shareText(live.url))).catch(() => undefined);
      }}
      onRevoke={() => {
        if (live === null) return;
        if (status !== 'confirm_revoke') {
          setStatus('confirm_revoke');
          return;
        }
        void commands?.send(REVOKE_DRIVER_PLAN_SHARE, { share_id: live.id }).then(() => {
          setCreated(null);
          setStatus('revoked');
          refresh();
        });
      }}
      onClose={onClose}
    />
  );
}
