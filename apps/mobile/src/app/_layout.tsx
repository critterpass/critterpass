import { Stack } from 'expo-router';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

// react-native-gesture-handler 3 requires exactly one GestureHandlerRootView ancestor for any
// GestureDetector to work at all — added here (not per-screen) the first time a screen (the
// timeline-drag motion spike) actually uses a raw gesture instead of a Pressable/ScrollView.
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Stack screenOptions={{ headerShown: false }} />
    </GestureHandlerRootView>
  );
}
