/**
 * The proposal screens' asks and notices as system alerts (the premium two-choice alert): telling
 * the crew you can't make it, locking the trip in, and the waitlist place a full trip gives.
 */
import { t } from '@lingui/core/macro';
import { Alert } from 'react-native';

import { confirmAlert } from '@/ui/premium/shell';

const cancel = () => t({ id: 'common.confirm.cancel', message: 'Cancel' });

/** "Tell the crew you can't make it?": resolves true when they go out. */
export function askGoingOut(): Promise<boolean> {
  return confirmAlert({
    title: t({ id: 'proposal.out.title', message: 'Tell the crew you can’t make it?' }),
    message: [
      t({ id: 'proposal.out.seat', message: 'Your seat goes to whoever is waiting.' }),
      t({
        id: 'proposal.out.resplit',
        message: 'Shared costs are split again without you, once the organiser applies it.',
      }),
    ].join('\n'),
    confirm: t({ id: 'proposal.out.confirm', message: 'I can’t make it' }),
    cancel: cancel(),
  });
}

/** Lock it in, with what happens to the maybes and the people who didn't answer. */
export function askToLock(title: string, consequences: readonly string[], confirm: string) {
  return confirmAlert({
    title,
    message: consequences.join('\n'),
    confirm,
    cancel: cancel(),
    destructive: false,
  });
}

/** The trip is full: the reply is kept as a waitlist place; resolves once it is read. */
export function showWaitlisted(position: number | null, cap: number | null): Promise<void> {
  const seats =
    cap === null
      ? t({ id: 'proposal.seat.body', message: 'Every seat is taken.' })
      : t({ id: 'proposal.seat.bodyCap', message: `All ${cap} seats are taken.` });
  const place =
    position === null
      ? t({ id: 'proposal.seat.waiting', message: 'You’re on the waitlist.' })
      : t({ id: 'proposal.seat.position', message: `You’re number ${position} on the waitlist.` });
  const offer = t({
    id: 'proposal.seat.offer',
    message: 'If a seat frees up, it’s offered to you first in line. Nothing joins you by itself.',
  });
  return new Promise((resolve) => {
    Alert.alert(
      t({ id: 'proposal.seat.title', message: 'The trip is full' }),
      `${seats} ${place} ${offer}`,
      [{ text: t({ id: 'proposal.seat.ok', message: 'Got it' }), onPress: () => resolve() }],
      { cancelable: true, onDismiss: () => resolve() },
    );
  });
}
