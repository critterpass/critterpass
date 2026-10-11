/** Where trip settings (4.53), changing the dates (4.54) and cancelling (4.55) live in a trip. */
/* eslint-disable lingui/no-unlocalized-strings -- route paths, never copy. */
import type { Href } from 'expo-router';

export const settingsRoutes = {
  settings: (tripId: string): Href => ({ pathname: '/[tripId]/settings', params: { tripId } }),
  dates: (tripId: string): Href => ({ pathname: '/[tripId]/settings/dates', params: { tripId } }),
  cancel: (tripId: string): Href => ({ pathname: '/[tripId]/settings/cancel', params: { tripId } }),
};
