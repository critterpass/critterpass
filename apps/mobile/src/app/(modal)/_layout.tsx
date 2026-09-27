import { Stack } from 'expo-router/js-stack';

/** Sheets and rise modals (screens owned by their areas). */
export default function ModalLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
