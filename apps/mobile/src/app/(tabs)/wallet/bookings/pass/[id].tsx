import { router, useLocalSearchParams } from 'expo-router';
import { Modal } from 'react-native';

import { BoardingPassScreen } from '@/features/bookings/boarding-pass/BoardingPassScreen';

/** The boarding pass or voucher, full screen over the tab bar. */
export default function BoardingPassRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Modal visible animationType="fade" onRequestClose={() => router.back()} statusBarTranslucent>
      <BoardingPassScreen bookingId={id} />
    </Modal>
  );
}
