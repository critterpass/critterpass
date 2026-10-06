/**
 * The screenshot a shake attaches to a problem report: the mask goes up, the screen is given a
 * moment to draw it, the picture is taken, and the mask comes down whatever happened. Also the
 * rule for when a shake opens a report at all.
 */
/* eslint-disable lingui/no-unlocalized-strings -- route paths and reasons, never copy. */
import { maskModeFor, type MaskMode } from './mask';

export interface CapturePorts {
  readonly setMask: (mode: MaskMode | null) => void;
  /** Resolves once the mask has been drawn. */
  readonly settle: () => Promise<void>;
  /** A file URI of the screen as it is drawn now, or `null` when it cannot be taken. */
  readonly capture: () => Promise<string | null>;
}

/** The masked screenshot of the screen at `pathname`, or `null`; never an unmasked one. */
export async function captureMasked(pathname: string, ports: CapturePorts): Promise<string | null> {
  ports.setMask(maskModeFor(pathname));
  try {
    await ports.settle();
    return await ports.capture();
  } catch {
    return null;
  } finally {
    ports.setMask(null);
  }
}

export interface ShakeFacts {
  /** The person left "Shake to report" on. */
  readonly enabled: boolean;
  readonly pathname: string;
  /** A text field has the keyboard: on iOS a shake there means "undo typing". */
  readonly typing: boolean;
  /** A report from an earlier shake is still being put together. */
  readonly busy: boolean;
}

export type ShakeVerdict =
  | { readonly open: true }
  | { readonly open: false; readonly reason: 'off' | 'typing' | 'busy' | 'reporting' };

const FEEDBACK_PATH = '/help-centre/feedback';

export function shakeVerdict(facts: ShakeFacts): ShakeVerdict {
  if (!facts.enabled) return { open: false, reason: 'off' };
  if (facts.busy) return { open: false, reason: 'busy' };
  if (facts.typing) return { open: false, reason: 'typing' };
  if (facts.pathname.startsWith(FEEDBACK_PATH)) return { open: false, reason: 'reporting' };
  return { open: true };
}
