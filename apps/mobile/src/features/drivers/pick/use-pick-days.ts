/**
 * The pick behind "Pick {name}: which legs?" for any sheet. SET writes the driver onto the picked
 * days at once and can open the days and pickup pins in WhatsApp; ASK drafts the same pick as a
 * change set the crew votes on (my yes goes with it), carrying a driver's quoted terms when the
 * pick came from a reply. A trip of one applies the change set at once.
 */
import { generateUuidV7, mapsPin } from '@cp/domain';
import { assignProviderPayload, pickDays } from '@cp/planner';
import { useLingui } from '@lingui/react/macro';
import { router } from 'expo-router';
import { useState } from 'react';
import { Linking } from 'react-native';

import { useCommand } from '@/data/commands/use-command';
import { sendChangesetOnline } from '@/data/plan/commands';
import { useLocale } from '@/lib/i18n/use-locale';
import { toast } from '@/motion/island-toast';

import { useDriverShares } from '../share/data';
import { driverCardOf } from '../shared/api';
import { assignCommand, createPickChangesetOnline } from '../shared/commands';
import { dayLabel } from '../shared/format';
import { driversRoute, splitDays } from '../shared/routes';
import { useDriverDays } from '../shared/use-driver-days';
import { useAssignments, useDrivers } from '../shared/use-drivers';
import { tellMessage, whatsappAsk } from '../shared/whatsapp-copy';
import {
  crewPickChangeset,
  crewPickOp,
  pickErrorOf,
  quoteTerms,
  type PickError,
} from './crew-pick';

const ASKED_TOAST = 'drivers-pick-asked';

export interface PickDaysProps {
  readonly tripId: string;
  readonly providerId: string;
  readonly days?: string | undefined;
  /** The driver's reply whose quote this pick is voted on (`/drivers/pick?quote`). */
  readonly quote?: string | undefined;
}

export function usePickDays(props: PickDaysProps) {
  const locale = useLocale();
  const { t } = useLingui();
  const plan = useDriverDays(props.tripId);
  const { state } = useDrivers(props.tripId);
  const assignments = useAssignments(props.tripId);
  const assign = useCommand(assignCommand);
  const create = useCommand(createPickChangesetOnline);
  const send = useCommand(sendChangesetOnline);
  const driver =
    state.kind === 'ready' || state.kind === 'offline'
      ? (state.data?.drivers ?? []).find((d) => d.id === props.providerId)
      : undefined;
  const card = driver === undefined ? null : driverCardOf(driver);
  const shares = useDriverShares(props.quote === undefined ? null : props.tripId);
  const reply =
    props.quote === undefined
      ? null
      : (shares.last?.replies.find((r) => r.id === props.quote) ?? null);
  const terms = reply === null ? null : quoteTerms(reply);
  const quoted = shares.last?.shares.find((s) => s.id === reply?.share_id)?.driver_name;
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set(splitDays(props.days)));
  const [tell, setTell] = useState(true);
  const [error, setError] = useState<PickError | null>(null);
  const [busy, setBusy] = useState<'set' | 'ask' | null>(null);
  const assignedOn = new Map(assignments.rows.map((row) => [row.day_date, row]));
  const days = pickDays(
    plan.days.map((day) => ({
      date: day.date,
      window: day.window,
      pickup: day.stops[0]?.name ?? null,
      assignedProviderId: assignedOn.get(day.date)?.provider_id ?? null,
    })),
    props.providerId,
    card?.included_hours ?? null,
  );
  const name = driver?.name ?? quoted ?? '';
  const solo = plan.people <= 1;
  const chosen = days.filter((day) => picked.has(day.date) && !day.taken);
  const long = chosen.find((day) => day.overHours);
  const set = async () => {
    const payload = assignProviderPayload(props.tripId, props.providerId, days, picked);
    if (payload === null) return;
    setBusy('set');
    setError(null);
    const failed = pickErrorOf(await assign.send(payload));
    setBusy(null);
    if (failed !== null) {
      setError(failed);
      return;
    }
    if (tell && driver?.phone) {
      const text = tellMessage(
        t,
        name,
        chosen.map((day) => {
          const stop = plan.days.find((d) => d.date === day.date)?.stops[0];
          return {
            label: dayLabel(day.date, locale),
            window: day.window === null ? null : `${day.window.start}–${day.window.end}`,
            pin: stop === undefined ? null : mapsPin(stop.lat, stop.lng),
          };
        }),
      );
      const url = whatsappAsk(driver.phone, text);
      if (url !== null) void Linking.openURL(url);
    }
    router.dismissTo(driversRoute(props.tripId));
  };
  /** Drafts the pick as a change set and sends it: the crew votes, and my yes goes with it. */
  const ask = async () => {
    const op = crewPickOp(props.providerId, days, picked, terms ?? undefined);
    if (op === null) return;
    if (plan.baseVersion === null) {
      // eslint-disable-next-line lingui/no-unlocalized-strings -- an error kind, never copy.
      setError({ kind: 'plan_moved' });
      return;
    }
    setBusy(solo ? 'set' : 'ask');
    setError(null);
    const changesetId = generateUuidV7();
    const drafted = pickErrorOf(
      await create.send(
        crewPickChangeset({
          changesetId,
          tripId: props.tripId,
          baseVersion: plan.baseVersion,
          op,
        }),
      ),
    );
    const failed = drafted ?? pickErrorOf(await send.send({ changeset_id: changesetId }));
    setBusy(null);
    if (failed !== null) {
      setError(failed);
      return;
    }
    toast.dismiss();
    // On a trip of one the pick is in at once: there is nobody to wait for.
    if (!solo)
      toast.show({
        id: ASKED_TOAST,
        title: t({ id: 'drivers.pick.asked', message: 'Sent to the crew' }),
        subtitle: t({
          id: 'drivers.pick.askedLine',
          message: `Your yes is counted. ${name} is set once enough of them say yes.`,
        }),
      });
    router.dismissTo(driversRoute(props.tripId));
  };
  const toggle = (date: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(date)) next.delete(date);
      else next.add(date);
      return next;
    });
  return {
    name,
    plan,
    days,
    assignedOn,
    picked,
    toggle,
    tell,
    setTell,
    phone: driver?.phone ?? null,
    includedHours: card?.included_hours ?? null,
    long,
    terms,
    error,
    chosen,
    busy,
    solo,
    set: () => void set(),
    ask: () => void ask(),
  };
}
