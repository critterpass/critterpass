/**
 * The help centre's routes and the design ids the navigation registry knows them by: the hub
 * (3p-1, with search in place), an article, send feedback (3p-2) and the note pinned once sent
 * (3p-3). The paths sit under `/help-centre` because `/help` is the trip's Help and SOS screen.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and design ids, never copy. */
import type { Href } from 'expo-router';

import { registerScreens } from '@/lib/navigation/screen-registry';

export type FeedbackMode = 'feedback' | 'problem' | 'idea';

export const HELP_ROUTES = {
  hub: '/help-centre',
  feedback: '/help-centre/feedback',
  feedbackSent: '/help-centre/feedback-sent',
} as const satisfies Readonly<Record<string, Href>>;

export function articleHref(slug: string): Href {
  return { pathname: '/help-centre/article/[slug]', params: { slug } };
}

export function feedbackHref(input: {
  readonly mode: FeedbackMode;
  readonly article?: string;
  readonly context?: string;
}): Href {
  return {
    pathname: HELP_ROUTES.feedback,
    params: {
      mode: input.mode,
      ...(input.article === undefined ? {} : { article: input.article }),
      ...(input.context === undefined ? {} : { context: input.context }),
    },
  };
}

export function feedbackSentHref(
  ticketId: string,
  note: {
    readonly note: string;
    readonly mood: string | null;
    readonly topic: string | null;
  },
): Href {
  return {
    pathname: HELP_ROUTES.feedbackSent,
    params: {
      ticket: ticketId,
      note: note.note,
      ...(note.mood === null ? {} : { mood: note.mood }),
      ...(note.topic === null ? {} : { topic: note.topic }),
    },
  };
}

export const HELP_SCREENS: Readonly<Record<string, Href>> = {
  '3p-1': HELP_ROUTES.hub,
  '3p-2': HELP_ROUTES.feedback,
  '3p-3': HELP_ROUTES.feedbackSent,
};

registerScreens(HELP_SCREENS);
