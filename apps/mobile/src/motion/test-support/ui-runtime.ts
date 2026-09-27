// Runs a worklet the way the real UI runtime does, for this package's Jest mock of
// `react-native-reanimated` (./reanimated-mock.ts). Under Jest a worklet is an ordinary JS closure,
// so it can call any function it captured; on a device, react-native-worklets rebuilds the worklet on
// the UI runtime from the code string the Babel plugin recorded (`__initData.code`) plus its captured
// values (`__closure`), and every captured function that is not itself a worklet becomes a remote
// function whose synchronous call throws — which, inside a frame callback, aborts the whole app. This
// module reproduces that rebuild so a worklet calling a plain helper fails the test instead of the
// release build.
import * as Worklets from 'react-native-worklets';

interface WorkletFunction {
  (...args: unknown[]): unknown;
  readonly __workletHash: number;
  readonly __initData: { readonly code: string };
  readonly __closure?: readonly unknown[] | Readonly<Record<string, unknown>>;
}

type AnyFunction = (...args: unknown[]) => unknown;

/** Functions the worklet runtime itself provides, keyed to the UI-runtime behaviour they get. */
const libraryFunctions = new Map<unknown, AnyFunction | null>();

/** A JS-thread function captured by a worklet, mapped to the original it stands in for. */
const remoteOriginals = new WeakMap<AnyFunction, AnyFunction>();

/** A worklet rebuilt on the emulated UI runtime, mapped to the JS-thread worklet it came from. */
const uiWorkletOriginals = new WeakMap<AnyFunction, WorkletFunction>();

export function isWorklet(value: unknown): value is WorkletFunction {
  return (
    typeof value === 'function' &&
    typeof (value as Partial<WorkletFunction>).__workletHash === 'number' &&
    typeof (value as Partial<WorkletFunction>).__initData?.code === 'string'
  );
}

function remoteFunction(original: AnyFunction): AnyFunction {
  const name = original.name === '' ? 'anonymous' : original.name;
  const guard: AnyFunction = () => {
    throw new Error(
      // eslint-disable-next-line lingui/no-unlocalized-strings -- mirrors the worklets runtime's developer-facing error, never rendered.
      `[Worklets] Tried to synchronously call a Remote Function. Called "${name}" on the UI Runtime.`,
    );
  };
  remoteOriginals.set(guard, original);
  return guard;
}

/** What a value captured on the JS thread becomes once the worklet runs on the UI runtime. */
function toUIValue(value: unknown): unknown {
  if (typeof value !== 'function') return value;
  if (libraryFunctions.has(value)) return libraryFunctions.get(value) ?? value;
  // Already a UI-runtime value: a worklet built inside another worklet captures these directly.
  if (remoteOriginals.has(value as AnyFunction) || uiWorkletOriginals.has(value as AnyFunction)) {
    return value;
  }
  if (isWorklet(value)) return toUIWorklet(value);
  return remoteFunction(value as AnyFunction);
}

/** What a UI-runtime value becomes when handed back to the JS thread (`scheduleOnRN` arguments). */
function toJSValue(value: unknown): unknown {
  if (typeof value !== 'function') return value;
  return (
    remoteOriginals.get(value as AnyFunction) ??
    uiWorkletOriginals.get(value as AnyFunction) ??
    value
  );
}

function scheduleOnRNFromUI(fun: unknown, ...args: unknown[]): void {
  const target = typeof fun === 'function' ? toJSValue(fun) : fun;
  if (typeof target !== 'function' || (target === fun && !libraryFunctions.has(fun))) {
    const name = typeof fun === 'function' && fun.name !== '' ? ` (${fun.name})` : '';
    // eslint-disable-next-line lingui/no-unlocalized-strings -- mirrors the worklets runtime's developer-facing error, never rendered.
    throw new Error(`[Worklets] Locally defined function passed to scheduleOnRN${name}.`);
  }
  const jsArgs = args.map(toJSValue);
  queueMicrotask(() => (target as AnyFunction)(...jsArgs));
}

let workletsRegistered = false;

function registerLibraryFunctions(): void {
  workletsRegistered = true;
  for (const value of Object.values(Worklets)) {
    if (typeof value === 'function') libraryFunctions.set(value, null);
  }
  const runOnJSFromUI =
    (fun: unknown) =>
    (...args: unknown[]) =>
      scheduleOnRNFromUI(fun, ...args);
  libraryFunctions.set(Worklets.scheduleOnRN, scheduleOnRNFromUI);
  libraryFunctions.set(Worklets.runOnJS, runOnJSFromUI);
  libraryFunctions.set(scheduleOnRNFromUI, null);
  libraryFunctions.set(runOnJSFromUI, null);
}

/**
 * Marks functions the worklet runtime provides on the UI thread itself (the mocked Reanimated
 * animation builders, for example), so a worklet calling them runs them rather than hitting a
 * remote-function guard.
 */
export function registerUIRuntimeFunctions(functions: Iterable<unknown>): void {
  for (const value of functions) {
    if (typeof value === 'function' && !libraryFunctions.has(value))
      libraryFunctions.set(value, null);
  }
}

/**
 * Rebuilds `worklet` from its recorded code and captured values, as the UI runtime would. Throws if
 * `worklet` was not compiled as a worklet (the UI runtime cannot run a plain function at all).
 */
export function toUIWorklet<Fn>(worklet: Fn): Fn {
  if (!isWorklet(worklet)) {
    const name = typeof worklet === 'function' && worklet.name !== '' ? ` ${worklet.name}` : '';
    throw new Error(
      // eslint-disable-next-line lingui/no-unlocalized-strings -- a developer-facing throw, never rendered.
      `[Worklets] Function${name} is not a worklet and cannot run on the UI runtime.`,
    );
  }
  if (!workletsRegistered) registerLibraryFunctions();
  const captured = worklet.__closure ?? [];
  const closure = Array.isArray(captured)
    ? captured.map(toUIValue)
    : Object.fromEntries(Object.entries(captured).map(([key, value]) => [key, toUIValue(value)]));
  // The recorded code is the worklet's own source as the Babel plugin emitted it for the UI runtime,
  // so evaluating it here is the same step react-native-worklets performs on a device.
  // eslint-disable-next-line @typescript-eslint/no-implied-eval -- deliberate: see above.
  const factory = new Function(`return ${worklet.__initData.code}`) as () => AnyFunction;
  const rebuilt = factory();
  const bound = rebuilt.bind({ __closure: closure });
  uiWorkletOriginals.set(bound, worklet);
  return bound as Fn;
}
