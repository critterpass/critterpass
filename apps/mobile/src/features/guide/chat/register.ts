/**
 * The guide area's registrations into other areas, imported once by the root layout: the guide
 * sheet (3j-1), voice mode (3j-2), point and ask (3j-3) and phrase practice in the navigation
 * registry (the guide button opens the
 * sheet, its microphone opens voice mode), the guide's offer card in
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
  /**
   * Point and ask: the menu camera. Opened from the guide sheet it carries `from: 'guide'` and the
   * sheet's `mode`, so a question about the menu goes back to that sheet.
   */
  camera: (params: { tripId?: string; mode?: string; from?: string } = {}): Href => ({
    pathname: '/guide/camera',
    params: {
      ...(params.tripId === undefined ? {} : { tripId: params.tripId }),
      ...(params.mode === undefined ? {} : { mode: params.mode }),
      ...(params.from === undefined ? {} : { from: params.from }),
    },
  }),
  /** Phrase practice, for a language and optionally the phrase to start on. */
  practice: (params: { tripId?: string; lang?: string; text?: string } = {}): Href => ({
    pathname: '/guide/practice',
    params: {
      ...(params.tripId === undefined ? {} : { tripId: params.tripId }),
      ...(params.lang === undefined ? {} : { lang: params.lang }),
      ...(params.text === undefined ? {} : { text: params.text }),
    },
  }),
  /**
   * Voice mode; `mode` is the GROUP / JUST ME choice of the sheet it was opened from, and `talk`
   * opens it already listening (the microphone was held).
   */
  voice: (params: { tripId?: string; mode?: string; talk?: boolean } = {}): Href => ({
    pathname: '/guide/voice',
    params: {
      ...(params.tripId === undefined ? {} : { tripId: params.tripId }),
      ...(params.mode === undefined ? {} : { mode: params.mode }),
      ...(params.talk === true ? { talk: '1' } : {}),
    },
  }),
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
  '3j-3': (params) =>
    guideRoutes.camera({
      ...(params['tripId'] === undefined ? {} : { tripId: params['tripId'] }),
      ...(params['mode'] === undefined ? {} : { mode: params['mode'] }),
      ...(params['from'] === undefined ? {} : { from: params['from'] }),
    }),
  // Not a design screen: phrase cards and the phrase quest open practice by this key.
  'guide-practice': (params) =>
    guideRoutes.practice({
      ...(params['tripId'] === undefined ? {} : { tripId: params['tripId'] }),
      ...(params['lang'] === undefined ? {} : { lang: params['lang'] }),
      ...(params['text'] === undefined ? {} : { text: params['text'] }),
    }),
  '3j-2': (params) =>
    guideRoutes.voice({
      ...(params['tripId'] === undefined ? {} : { tripId: params['tripId'] }),
      ...(params['mode'] === undefined ? {} : { mode: params['mode'] }),
      talk: params['talk'] === '1',
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
