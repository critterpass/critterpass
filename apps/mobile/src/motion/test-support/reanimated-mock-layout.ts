// Layout animations and the Reduce Motion enum for the Jest mock of `react-native-reanimated`
// (`reanimated-mock.ts`). The mock renders `Animated.View` as a plain `View`, so `entering`,
// `exiting` and `layout` never run: a builder only has to survive its configuration chain
// (`FadeIn.duration(…)`, `LinearTransition.springify().stiffness(…)`).

const ReduceMotion = { System: 'system', Always: 'always', Never: 'never' } as const;

const CHAIN = [
  'duration',
  'delay',
  'springify',
  'stiffness',
  'damping',
  'mass',
  'easing',
  'withCallback',
  'withInitialValues',
  'reduceMotion',
  'randomDelay',
  'overshootClamping',
  'dampingRatio',
  'build',
] as const;

type LayoutBuilder = {
  readonly [Method in (typeof CHAIN)[number]]: (...args: unknown[]) => LayoutBuilder;
};

function layoutBuilder(name: string): LayoutBuilder {
  const builder = { name } as unknown as Record<string, unknown>;
  for (const method of CHAIN) builder[method] = () => builder;
  return builder as unknown as LayoutBuilder;
}

const LAYOUT_NAMES = [
  'FadeIn',
  'FadeOut',
  'FadeInDown',
  'FadeOutDown',
  'FadeInUp',
  'FadeOutUp',
  'FadeInRight',
  'FadeOutRight',
  'FadeInLeft',
  'FadeOutLeft',
  'ZoomIn',
  'ZoomOut',
  'SlideInDown',
  'SlideOutDown',
  'SlideInUp',
  'SlideOutUp',
  'SlideInRight',
  'SlideOutRight',
  'LinearTransition',
] as const;

export const layoutMockExports: Record<string, unknown> = {
  ReduceMotion,
  ...Object.fromEntries(LAYOUT_NAMES.map((name) => [name, layoutBuilder(name)])),
};
