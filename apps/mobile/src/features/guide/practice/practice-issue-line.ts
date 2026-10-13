/** The line practice shows for what went wrong (no microphone, no signal, nothing heard). */
import { useLingui } from '@lingui/react/macro';
import type { PracticeIssue } from './practice-model';

export function useIssueLine(issue: PracticeIssue | null, guideName: string): string | null {
  const { t } = useLingui();
  switch (issue) {
    case null:
    case 'mic_denied':
      return null;
    case 'no_speech_module':
      return t({
        id: 'guide.practice.noModule',
        message: 'This version of the app can\'t listen. Say it, then tap "I said it".',
      });
    case 'heard_nothing':
      return t({
        id: 'guide.practice.heardNothing',
        message: "I didn't catch that. Say it once more, a little closer to the phone.",
      });
    case 'listen_failed':
      return t({
        id: 'guide.practice.listenFailed',
        message: "Listening didn't start. Try again.",
      });
    case 'offline':
      return t({
        id: 'guide.practice.offline',
        message: `${guideName} can't check how it sounds offline. Say it, then tap "I said it".`,
      });
    case 'check_failed':
      return t({
        id: 'guide.practice.checkFailed',
        message: "That one couldn't be checked, so it wasn't counted. Try again.",
      });
  }
}
