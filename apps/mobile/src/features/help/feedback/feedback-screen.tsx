/**
 * Send feedback over the phone: the form's state, pictures from the library, the device line, and
 * sending. A note without pictures goes straight into the offline command queue; one with pictures
 * waits in the feedback outbox until they are uploaded. Either way the sent page opens at once.
 */
import { FEEDBACK_ATTACHMENTS_MAX, generateUuidV7, type FeedbackSource } from '@cp/domain';
import { useLingui } from '@lingui/react/macro';
import { router, useLocalSearchParams, usePreventRemove, type Href } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';

import { useCommand } from '@/data/commands/use-command';
import { useLocalFirst } from '@/data/powersync/local-first-context';
import { useLocale } from '@/lib/i18n/use-locale';
import { goBackOr } from '@/lib/navigation/back';
import { useCommandFeedback } from '@/motion/island-toast';
import { ConfirmSheet } from '@/ui/states/ConfirmSheet';

import { useHelpArticles } from '../data/use-help-articles';
import { feedbackSentHref, HELP_ROUTES, type FeedbackMode } from '../routes';
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

const TOAST = 'help-feedback-send';

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
  const { t } = useLingui();
  const { report } = useCommandFeedback();
  const submit = useCommand(submitFeedbackCommand);
  const { articles } = useHelpArticles();
  const [draft, setDraft] = useState(() =>
    initialDraft(mode, typeof params.shot === 'string' ? params.shot : null),
  );
  const [tooBig, setTooBig] = useState(false);
  const [sending, setSending] = useState(false);
  // A note with words or photos in it is not dropped by a swipe back: leaving asks first. Once it
  // is sent, or the person chose to leave, the screen may go where `exit` says.
  const [leaving, setLeaving] = useState(false);
  const [exit, setExit] = useState<{ readonly to: Href | null } | null>(null);
  const started = useState(() => draft.attachments.length)[0];
  const dirty = draft.text.trim() !== '' || draft.attachments.length > started;
  usePreventRemove(dirty && exit === null, () => setLeaving(true));
  useEffect(() => {
    if (exit === null) return undefined;
    // After the guard above has let go of the screen.
    const timer = setTimeout(
      () => (exit.to === null ? goBackOr(HELP_ROUTES.hub) : router.replace(exit.to)),
      0,
    );
    return () => clearTimeout(timer);
  }, [exit]);
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
        // Kept on the phone when offline; a refusal leaves the note here to send again.
        const outcome = report(await submit.send(payload), { offlineCapable: true, id: TOAST });
        if (outcome === 'refused' || outcome === 'needs-signal') return;
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
      setExit({
        to: feedbackSentHref(id, {
          note: condensedNote(draft.text),
          mood: draft.mood,
          topic: draft.category,
        }),
      });
    } catch {
      report(
        { kind: 'unavailable' },
        {
          id: TOAST,
          needsSignal: t({
            id: 'help.feedback.notSaved',
            message: 'Your note wasn’t saved. It’s still here: try again.',
          }),
        },
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <>
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
        onBack={() => goBackOr(HELP_ROUTES.hub)}
      />
      {leaving ? (
        <ConfirmSheet
          title={t({ id: 'help.feedback.discardTitle', message: 'Leave without sending?' })}
          consequences={[
            t({
              id: 'help.feedback.discardLine',
              message: 'Your note and its photos are dropped.',
            }),
          ]}
          confirmLabel={t({ id: 'help.feedback.discard', message: 'Leave' })}
          mode="button"
          onConfirm={() => {
            setLeaving(false);
            setExit({ to: null });
          }}
          onCancel={() => setLeaving(false)}
          testID="help-feedback-discard"
        />
      ) : null}
    </>
  );
}
