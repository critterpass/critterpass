import { Stack } from 'expo-router/js-stack';

import { DeleteScreen } from '@/features/you/account/delete-screen';
import { LocalFirstGate } from '@/features/you/local-first-gate';

/** Delete account (3n-9, 3n-10) and, once closed, the last page (3n-11). */
export default function DeleteAccountRoute() {
  return (
    <LocalFirstGate>
      <DeleteScreen whenClosed={<Stack.Screen options={{ gestureEnabled: false }} />} />
    </LocalFirstGate>
  );
}
