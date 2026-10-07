/**
 * Monetisation joins the app: the places other areas offer Pass+ or a boost open the paywall or
 * the boost sheet from here, Settings gets its plan chip and the crew chat its boost card. Every one of them is a button the
 * person taps; the paywall itself records that it was shown, with the entry it was opened from.
 * Imported once by the root layout.
 */
import { t } from '@lingui/core/macro';
import { router } from 'expo-router';
import { createElement } from 'react';

import { registerMailboxPaywall } from '@/features/bookings';
import {
  registerChatCard,
  registerChatHeaderBadge,
  registerLiveMapPaywall,
  registerSeatLimitPresenter,
} from '@/features/crew';
import { registerHomeNotice } from '@/features/home';
import { registerRedraftBoost } from '@/features/plan';
import { registerSeatBoost } from '@/features/proposal';
import { registerPlanChip, registerProfileNotice } from '@/features/you';

import { BoostChatCard } from './boost-card/boost-chat-card';
import { BillingIssueBanner } from './plan/billing-issue-banner';
import { BoostedPill } from './boost-card/boosted-pill';
import { SeatCapSheet } from './seat-cap/seat-cap-sheet';
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
// The buyer's TELL THE CREW posts a `boost_card` message, drawn as the crew's boost card.
// eslint-disable-next-line lingui/no-unlocalized-strings -- a message type, never copy.
registerChatCard('boost_card', {
  Component: (props) => createElement(BoostChatCard, props),
  estimateHeight: () => 240,
  a11yLabel: () => t({ id: 'monetize.card.label', message: 'Trip boost' }),
});
registerChatHeaderBadge(BoostedPill);
// A full crew at the free cap: the seventh-seat sheet in place of the plain waitlist one.
registerSeatLimitPresenter(SeatCapSheet);
// While a Pass+ renewal has failed, Home and the profile say so and open the page that fixes it.
registerHomeNotice(BillingIssueBanner);
registerProfileNotice(BillingIssueBanner);
