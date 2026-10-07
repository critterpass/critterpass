/**
 * Monetisation joins the app: the places other areas offer Pass+ or a boost open the paywall or
 * the boost sheet from here, and Settings gets its plan chip. Every one of them is a button the
 * person taps; the paywall itself records that it was shown, with the entry it was opened from.
 * Imported once by the root layout.
 */
import { router } from 'expo-router';

import { registerMailboxPaywall } from '@/features/bookings';
import { registerLiveMapPaywall } from '@/features/crew';
import { registerRedraftBoost } from '@/features/plan';
import { registerSeatBoost } from '@/features/proposal';
import { registerPlanChip } from '@/features/you';

import { usePlanChip } from './plan/use-plan-chip';
import { boostHref, paywallHref } from './routes';

const openBoost = (tripId: string) => router.push(boostHref(tripId));

// Unlimited redrafts, a seventh seat and the live crew map are the trip boost's.
registerRedraftBoost(openBoost);
registerSeatBoost(openBoost);
registerLiveMapPaywall(openBoost);
// Bookings from email is Pass+'s.
registerMailboxPaywall(() => router.push(paywallHref({})));
registerPlanChip(usePlanChip);
