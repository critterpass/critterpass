/**
 * Balance the crew (7h-5), organisers only: worked out on this phone from synced rows; for the
 * first member at zero, their saves that fit without moving anything, ADD BOTH (applied as the
 * organiser) and ASK {NAME} FIRST (a private ask only the two of them see). A member who opens it
 * goes back to the plan check.
 */
import { generateStableId, generateUuidV7, type PlanOp } from '@cp/domain';
import { Redirect, router } from 'expo-router';

import { goBackOr } from '@/lib/navigation/back';
import { useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useTripPlan } from '@/data/plan/use-trip-plan';
import { useDayEditing } from '@/features/plan/day/use-day-editing';
import { toast } from '@/motion/island-toast';

import { usePlanGuide } from '../../plan-guide';
import { backTripLabel } from '../check-copy';
import { askMemberOnline } from '../commands';
import { useCheckContext } from '../data/use-check-context';
import { useMemberAsks } from '../data/use-member-ask';
import { weekdayName } from '../format';
import { checkRoutes } from '../routes';
import * as copy from './balance-copy';
import { BalanceView, type BalanceOfferView } from './balance-view';
import { useBalance } from './use-balance';

export function BalanceScreen({ tripId }: { readonly tripId: string }) {
  const plan = useTripPlan(tripId);
  const guideName = usePlanGuide().name;
  const editor = useDayEditing(plan);
  const ctx = useCheckContext(plan);
  const ask = useCommand(askMemberOnline);
  const asks = useMemberAsks(tripId);
  const { loaded, balance } = useBalance(plan);
  const [busy, setBusy] = useState<'add' | 'ask' | null>(null);
  if (plan.loaded && !plan.organiser) return <Redirect href={checkRoutes.check(tripId)} />;
  const tz = plan.trip?.tz ?? 'UTC';
  const zero = balance?.members.find((member) => member.saved > 0 && member.placed === 0) ?? null;
  const mine =
    zero === null
      ? undefined
      : asks.find((entry) => entry.askedBy === plan.uid && entry.memberId === zero.uid);
  const dayOf = (dayNo: number) => plan.dayRows.find((row) => row.day_no === dayNo) ?? null;

  const offer: BalanceOfferView | null =
    zero === null
      ? null
      : {
          line: copy.zeroLine(zero.name, zero.saved, zero.fits.length),
          joinIndex: zero.joinIndex,
          initialName: zero.name,
          places: zero.fits.map((slot) => {
            const day = dayOf(slot.dayNo);
            const date = day?.date ?? null;
            const time = date === null ? '' : ctx.clock(slot.startsAt, day?.id ?? null);
            return {
              key: slot.ideaId,
              name: slot.name,
              when: `${weekdayName(date)} ${time}`.trim(),
            };
          }),
          add:
            zero.fits.length === 0
              ? null
              : {
                  label: copy.addThemLabel(zero.fits.length),
                  busy: busy === 'add',
                  onPress: () => {
                    const ops: PlanOp[] = zero.fits.flatMap((slot) =>
                      slot.poiId === null
                        ? []
                        : [
                            {
                              op: 'add',
                              item: generateStableId(),
                              new: {
                                day_no: slot.dayNo,
                                starts_at: slot.startsAt,
                                ends_at: slot.endsAt,
                                tz,
                                poi_id: slot.poiId,
                                attendee_ids: [],
                              },
                            } satisfies PlanOp,
                          ],
                    );
                    setBusy('add');
                    void editor.submit(ops).then((outcome) => {
                      setBusy(null);
                      if (outcome.kind !== 'unavailable')
                        toast.show({ id: 'plan-balance-added', title: copy.addedToast() });
                    });
                  },
                },
          ask: {
            label: mine?.status === 'open' ? copy.askedLabel() : copy.askLabel(zero.name),
            busy: busy === 'ask',
            onPress:
              mine !== undefined
                ? null
                : () => {
                    const ideaIds = (
                      zero.fits.length > 0
                        ? zero.fits.map((slot) => slot.ideaId)
                        : zero.missedIdeaIds
                    ).slice(0, 3);
                    setBusy('ask');
                    void ask
                      .send({
                        ask_id: generateUuidV7(),
                        trip_id: tripId,
                        user_id: zero.uid,
                        idea_ids: ideaIds,
                      })
                      .then((result) => {
                        setBusy(null);
                        if (result.kind === 'applied')
                          toast.show({
                            id: 'plan-balance-asked',
                            ...copy.askedToast(zero.name, guideName),
                          });
                      });
                  },
          },
          status:
            mine === undefined
              ? null
              : mine.status === 'open'
                ? copy.waitingLine(zero.name, guideName)
                : mine.status === 'declined'
                  ? copy.declinedLine(zero.name)
                  : copy.acceptedLine(zero.name),
        };

  return (
    <BalanceView
      backLabel={backTripLabel()}
      onBack={() => goBackOr(checkRoutes.check(tripId))}
      onlyYou={copy.onlyYouLabel()}
      title={copy.balanceTitle()}
      summary={balance === null ? '' : copy.balanceSummary(balance.mustDosIn, balance.even)}
      loading={!loaded}
      rows={(balance?.members ?? []).map((member) => ({
        key: member.uid,
        name: member.you ? copy.youName(member.name) : member.name,
        joinIndex: member.joinIndex,
        mustDo:
          member.mustDo === null
            ? null
            : copy.mustDoLine(member.mustDo.title, member.mustDo.placed),
        saved: member.saved,
        placed: member.placed,
        count: copy.savesIn(member.placed, member.saved),
      }))}
      offer={offer}
    />
  );
}
