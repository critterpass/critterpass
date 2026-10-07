/**
 * The line the guide says when a menu scan stops short: one for each way it can (no camera, a
 * photo that did not take, no writing, a script the phone cannot read, offline, the day's
 * questions or menus used up, no dishes found, a reading that did not come through).
 */
import { useLingui } from '@lingui/react/macro';

import type { MenuIssue } from './menu-scan';

export function useIssueLine(issue: MenuIssue | null, guideName: string): string | null {
  const { t } = useLingui();
  switch (issue) {
    case null:
    case 'camera_denied':
      return null;
    case 'no_camera':
      return t({
        id: 'guide.camera.noCamera',
        message: `The camera isn't available here. Type what's on the menu and ${guideName} will translate it in the chat.`,
      });
    case 'capture_failed':
      return t({ id: 'guide.camera.captureFailed', message: "That photo didn't take. Try again." });
    case 'no_text':
      return t({
        id: 'guide.camera.noText',
        message: "I can't find any writing. Move closer, into better light, and try again.",
      });
    case 'unsupported_script':
      return t({
        id: 'guide.camera.unsupportedScript',
        message: "This phone can't read that script yet. Type a dish name and I'll explain it.",
      });
    case 'offline':
      return t({
        id: 'guide.camera.offline',
        message: `You're offline, so ${guideName} can't translate this yet. The photo stays here; try again when you're back online.`,
      });
    case 'quota':
      return t({
        id: 'guide.camera.quota',
        message: `That's today's questions used up. ${guideName} is back after midnight; the chat shows your options.`,
      });
    case 'fair_use':
      return t({
        id: 'guide.camera.fairUse',
        message: `${guideName} has read a lot of menus today and picks it up again tomorrow.`,
      });
    case 'no_dishes':
      return t({
        id: 'guide.camera.noDishes',
        message:
          "I can read the words, but I don't see any dishes. It wasn't counted. Try the menu page itself.",
      });
    case 'failed':
      return t({
        id: 'guide.camera.failed',
        message: "The translation didn't come through, and it wasn't counted. Try again.",
      });
  }
}
