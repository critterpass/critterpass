/**
 * One menu scan: a still from the camera, the phone's own text recognition over it, then the
 * lines (never the photo) to the menu route for the guide's reading. Everything the device does
 * comes in through ports. A scan the guide could not read is not counted by the server.
 */
/* eslint-disable lingui/no-unlocalized-strings -- issue and wire codes, never copy. */
import {
  MENU_AIMING,
  menuScanReducer,
  type MenuIssue,
  type MenuLine,
  type MenuReading,
  type MenuScanEvent,
  type MenuScanState,
} from './menu-scan';

/** The route's limits: lines per scan and characters per line. */
export const MENU_MAX_LINES = 120;
export const MENU_MAX_LINE_CHARS = 200;

export interface RecognisedStill {
  readonly status: 'ok' | 'unsupported_script' | 'no_text';
  readonly lines: readonly MenuLine[];
  readonly width: number;
  readonly height: number;
}

export interface MenuScanPorts {
  /** A still of what the camera shows, as a file URI; null when the camera has nothing. */
  readonly capture: () => Promise<string | null>;
  readonly recognize: (uri: string) => Promise<RecognisedStill>;
  readonly online: () => boolean;
  /** `POST /v1/camera/menu`; rejects with `{code, reason?}` when refused or dropped. */
  readonly read: (lines: readonly MenuLine[]) => Promise<MenuReading>;
}

export interface MenuScanController {
  readonly state: MenuScanState;
  scan(): Promise<void>;
  /** Back to the live camera for another menu. */
  retake(): void;
  /** The camera reported it cannot run (no module, refused, an error). */
  cameraFailed(issue: 'no_camera' | 'camera_denied'): void;
  dispose(): void;
}

function issueOf(error: unknown): MenuIssue {
  const { code, reason } = (error ?? {}) as { code?: unknown; reason?: unknown };
  if (code === 'QUOTA_EXHAUSTED') return 'quota';
  if (code === 'RATE_LIMITED' && reason === 'fair_use') return 'fair_use';
  return 'failed';
}

/** The lines as the route takes them: trimmed, non-empty, within its limits. */
export function linesForRoute(lines: readonly MenuLine[]): MenuLine[] {
  return lines
    .map((line) => ({ ...line, text: line.text.trim().slice(0, MENU_MAX_LINE_CHARS) }))
    .filter((line) => line.text !== '')
    .slice(0, MENU_MAX_LINES);
}

export function createMenuScanController(
  ports: MenuScanPorts,
  onState: (state: MenuScanState) => void,
): MenuScanController {
  let state = MENU_AIMING;
  let run = 0;
  let disposed = false;

  const emit = (event: MenuScanEvent) => {
    if (disposed) return;
    const next = menuScanReducer(state, event);
    if (next === state) return;
    state = next;
    onState(state);
  };

  return {
    get state() {
      return state;
    },
    async scan() {
      if (state.phase !== 'aiming') return;
      const mine = ++run;
      emit({ type: 'capturing' });
      let uri: string | null;
      let still: RecognisedStill;
      try {
        uri = await ports.capture();
        if (mine !== run) return;
        if (uri === null) return emit({ type: 'failed', issue: 'capture_failed' });
        still = await ports.recognize(uri);
      } catch {
        if (mine === run) emit({ type: 'failed', issue: 'capture_failed' });
        return;
      }
      if (mine !== run) return;
      if (still.status === 'unsupported_script') {
        return emit({ type: 'failed', issue: 'unsupported_script' });
      }
      const lines = linesForRoute(still.lines);
      if (still.status === 'no_text' || lines.length === 0) {
        return emit({ type: 'failed', issue: 'no_text' });
      }
      emit({
        type: 'captured',
        still: { uri, width: still.width, height: still.height },
        lines,
      });
      if (!ports.online()) return emit({ type: 'failed', issue: 'offline' });
      let reading: MenuReading;
      try {
        reading = await ports.read(lines);
      } catch (error) {
        if (mine === run) emit({ type: 'failed', issue: issueOf(error) });
        return;
      }
      if (mine !== run) return;
      if (reading.status === 'ok') return emit({ type: 'read', reading });
      emit({ type: 'failed', issue: reading.status === 'no_dishes' ? 'no_dishes' : 'failed' });
    },
    retake() {
      run += 1;
      emit({ type: 'retake' });
    },
    cameraFailed(issue) {
      run += 1;
      state = { ...MENU_AIMING, issue };
      if (!disposed) onState(state);
    },
    dispose() {
      run += 1;
      disposed = true;
    },
  };
}
