import type { ComponentRef, ReactNode, RefObject } from 'react';
import type { View } from 'react-native';

// `View`'s ref instance type (`measureInWindow` and friends) rather than `View` itself, which now
// types the component function, not what its ref resolves to.
type ViewInstance = ComponentRef<typeof View>;

export interface FlyToRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface FlyToRequest {
  readonly id: number;
  readonly node: ReactNode;
  readonly from: FlyToRect;
  readonly to: FlyToRect;
}

type FlyToListener = (requests: readonly FlyToRequest[]) => void;

const listeners = new Set<FlyToListener>();
let requests: readonly FlyToRequest[] = [];
let nextId = 0;

function notify(): void {
  listeners.forEach((listener) => listener(requests));
}

/** `OverlayHost` (the only subscriber in the running app) renders and animates queued requests. */
export const flyToOverlay = {
  subscribe(listener: FlyToListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  get requests(): readonly FlyToRequest[] {
    return requests;
  },
  dismiss(id: number): void {
    requests = requests.filter((request) => request.id !== id);
    notify();
  },
};

function measure(ref: RefObject<ViewInstance | null>): Promise<FlyToRect> {
  return new Promise((resolve, reject) => {
    const node = ref.current;
    if (!node) {
      // eslint-disable-next-line lingui/no-unlocalized-strings -- a developer-facing throw, never rendered.
      reject(new Error('flyTo: ref is not attached to a mounted view'));
      return;
    }
    node.measureInWindow((x: number, y: number, width: number, height: number) =>
      resolve({ x, y, width, height }),
    );
  });
}

/**
 * Measures `sourceRef`/`targetRef` and queues `node` to fly between them (docs/design-system.md
 * §3.4 `flyTo`: "overlay clone arc ... to target, 780, then pop + thud + toast"); `OverlayHost`
 * renders and animates the actual clone (it, not the caller, owns the arc/impact timing).
 */
export async function flyTo(
  sourceRef: RefObject<ViewInstance | null>,
  targetRef: RefObject<ViewInstance | null>,
  node: ReactNode,
): Promise<void> {
  const [from, to] = await Promise.all([measure(sourceRef), measure(targetRef)]);
  const id = nextId;
  nextId += 1;
  requests = [...requests, { id, node, from, to }];
  notify();
}
