/** The line voice mode shows for what went wrong (no microphone, no signal, the guide unreachable). */
import { useLingui } from '@lingui/react/macro';
import type { VoiceIssue } from './voice-turn';

export function useIssueLine(issue: VoiceIssue | null, guideName: string): string | null {
  const { t } = useLingui();
  switch (issue) {
    case null:
    case 'mic_denied':
      return null;
    case 'no_speech_module':
      return t({
        id: 'guide.voice.noModule',
        message: 'Voice is not available in this version of the app. Type your question instead.',
      });
    case 'heard_nothing':
      return t({
        id: 'guide.voice.heardNothing',
        message: 'I didn’t catch that. Somewhere quieter helps, or hold the phone closer.',
      });
    case 'listen_failed':
      return t({
        id: 'guide.voice.listenFailed',
        message: 'Listening didn’t start. Try again, or type your question.',
      });
    case 'offline_queued':
      return t({
        id: 'guide.voice.offlineQueued',
        message: `You're offline. ${guideName} has your question and answers in the chat when you're back online.`,
      });
    case 'quota':
      return t({
        id: 'guide.voice.quota',
        message: `That's today's questions used up. ${guideName} is back after midnight; the chat shows your options.`,
      });
    case 'reply_failed':
      return t({
        id: 'guide.voice.replyFailed',
        message: 'The answer didn’t come through, and it wasn’t counted. Ask again.',
      });
  }
}
