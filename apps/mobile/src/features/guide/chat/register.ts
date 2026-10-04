/**
 * The guide area's registrations into other areas, imported once by the root layout: the guide
 * sheet (3j-1) in the navigation registry (the guide button opens it), the guide's offer card in
 * crew chat, the guide's live line above the crew chat composer, and the device's phrase audio.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import { t } from '@lingui/core/macro';
import type { Href } from 'expo-router';
import { createElement } from 'react';

import { registerChatCard, registerChatComposerHint } from '@/features/crew';
import { registerScreens } from '@/lib/navigation/screen-registry';

import { GuideChatHint } from '../crew-mention/guide-chat-hint';
import { GuideOfferCard } from '../crew-mention/offer-card';
import { devicePhraseAudio } from '../phrases/device-phrase-audio';
import { providePhraseAudio } from '../phrases/phrase-audio';
import { GuideServicesProvider } from './data/guide-services';
import { deviceGuideServices } from './data/guide-stream';

export const guideRoutes = {
  /** Food and access needs (from the guide sheet's "+", trip setup and You settings). */
  dietary: (): Href => '/guide/dietary',
  sheet: (
    params: { threadId?: string; tripId?: string; mode?: string; q?: string } = {},
  ): Href => ({
    pathname: '/guide/[threadId]',
    params: {
      threadId: params.threadId ?? 'new',
      ...(params.tripId === undefined ? {} : { tripId: params.tripId }),
      ...(params.mode === undefined ? {} : { mode: params.mode }),
      ...(params.q === undefined ? {} : { q: params.q }),
    },
  }),
};

registerScreens({
  '3j-1': (params) =>
    guideRoutes.sheet({
      ...(params['threadId'] === undefined ? {} : { threadId: params['threadId'] }),
      ...(params['tripId'] === undefined ? {} : { tripId: params['tripId'] }),
      ...(params['mode'] === undefined ? {} : { mode: params['mode'] }),
      // A question to start from (search's ASK): it waits in the composer, not sent.
      ...(params['q'] === undefined ? {} : { q: params['q'] }),
    }),
});

registerChatCard('guide_offer', {
  Component: (props) => createElement(GuideOfferCard, props),
  estimateHeight: () => 150,
  a11yLabel: (message) => t({ id: 'guide.offer.label', message: `Guide offer: ${message.body}` }),
});

registerChatComposerHint(({ crewId }) =>
  createElement(GuideServicesProvider, {
    services: deviceGuideServices,
    children: createElement(GuideChatHint, { crewId }),
  }),
);

providePhraseAudio(devicePhraseAudio);
