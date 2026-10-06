/**
 * Send feedback over the phone: the form's state, pictures from the library, the device line, and
 * sending. A note without pictures goes straight into the offline command queue; one with pictures
 * waits in the feedback outbox until they are uploaded. Either way the sent page opens at once.
 */
import { FEEDBACK_ATTACHMENTS_MAX, generateUuidV7, type FeedbackSource } from '@cp/domain';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useLocalFirst } from '@/data/powersync/local-first-context';
import { useLocale } from '@/lib/i18n/use-locale';

import { useHelpArticles } from '../data/use-help-articles';
import { feedbackSentHref, type FeedbackMode } from '../routes';
import { submitFeedbackCommand } from './commands';
import { deviceInfoNow, deviceInfoWithNetwork } from './device-info';
import {
  addAttachments,
  canSend,
  condensedNote,
  deviceLine,
  feedbackPayload,
  initialDraft,
  topicsFor,
} from './draft';
import { FeedbackView } from './FeedbackView';
import { saveOutboxItem } from './outbox';
import { pickFeedbackPhotos } from './pick-photos';

function modeOf(value: unknown): FeedbackMode {
  return value === 'problem' || value === 'idea' ? value : 'feedback';
}

export function FeedbackScreen() {
  const params = useLocalSearchParams<{
    mode?: string;
    article?: string;
    context?: string;
    trip?: string;
    shot?: string;
    shake?: string;
  }>();
  const mode = modeOf(params.mode);
  const articleSlug = typeof params.article === 'string' ? params.article : null;
  const locale = useLocale();
  const { db } = useLocalFirst();
  const submit = useCommand(submitFeedbackCommand);
  const { articles } = useHelpArticles();
  const [draft, setDraft] = useState(() =>
    initialDraft(mode, typeof params.shot === 'string' ? params.shot : null),
  );
  const [tooBig, setTooBig] = useState(false);
  const [sending, setSending] = useState(false);
  const device = useMemo(() => deviceInfoNow(locale), [locale]);
  const articleTitle =
    articleSlug === null ? null : (articles.find((a) => a.slug === articleSlug)?.title ?? null);
  const source: FeedbackSource =
    params.shake === '1'
      ? 'shake'
      : articleSlug !== null
        ? 'article'
        : params.context === 'settings'
          ? 'settings'
          : 'help';

  const send = async () => {
    if (!canSend(draft) || sending) return;
    setSending(true);
    const id = generateUuidV7();
    const payload = feedbackPayload({
      id,
      draft,
      device: await deviceInfoWithNetwork(locale),
      context: {
        screen: typeof params.context === 'string' ? params.context : null,
        tripId: typeof params.trip === 'string' ? params.trip : null,
        articleSlug,
      },
      source,
      mediaKeys: [],
    });
    try {
      if (draft.attachments.length === 0) {
        await submit.send(payload);
      } else {
        await saveOutboxItem(db, {
          id,
          payload,
          files: draft.attachments.map((file) => ({
            uri: file.uri,
            contentType: file.contentType,
          })),
        });
      }
      router.replace(
        feedbackSentHref(id, {
          note: condensedNote(draft.text),
          mood: draft.mood,
          topic: draft.category,
        }),
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <FeedbackView
      mode={mode}
      draft={draft}
      topics={topicsFor(mode)}
      deviceLine={deviceLine(device)}
      canSend={canSend(draft)}
      sending={sending}
      tooBigNote={tooBig}
      articleTitle={articleTitle}
      onMood={(mood) => setDraft((d) => ({ ...d, mood: d.mood === mood ? null : mood }))}
      onTopic={(topic) =>
        setDraft((d) => ({ ...d, category: d.category === topic ? null : topic }))
      }
      onText={(text) => setDraft((d) => ({ ...d, text }))}
      onAddPhoto={() => {
        void pickFeedbackPhotos(FEEDBACK_ATTACHMENTS_MAX - draft.attachments.length).then(
          (picked) => {
            if (picked.length === 0) return;
            const next = addAttachments(draft, picked);
            setDraft(next.draft);
            setTooBig(next.tooBig > 0);
          },
        );
      }}
      onRemovePhoto={(index) =>
        setDraft((d) => ({ ...d, attachments: d.attachments.filter((_, i) => i !== index) }))
      }
      onDeviceInfo={(on) => setDraft((d) => ({ ...d, includeDeviceInfo: on }))}
      onSend={() => void send()}
      onBack={() => router.back()}
    />
  );
}
