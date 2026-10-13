/**
 * The three pieces of Expo Router's own build the app reads that it does not export publicly: the
 * presentation of the screen a component renders in, whether a route is focused, and the root
 * navigation ref. Pinned here, in one place, so an SDK that moves them fails this module's test
 * instead of a screen at run time.
 */
export { ScreenPresentationContext } from 'expo-router/build/react-navigation/native-stack/utils/ScreenPresentationContext';
export { useIsRouteFocused } from 'expo-router/build/react-navigation/core/useIsFocused';
export { navigationRef } from 'expo-router/build/global-state/navigationRef';
